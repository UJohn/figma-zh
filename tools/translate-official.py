#!/usr/bin/env python3
# 用本地模型网关把 Figma 官方英文词典逐条翻译为简体中文。
# 不复制任何第三方中文词典；仅使用 Figma 官方英文原文 + Sketch 官方中文术语作术语参考。
import json, os, re, sys, time, threading, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EN = '/tmp/figma_en.json'
CACHE = os.path.join(ROOT, 'data/official-zh.cache.json')
OUT = os.path.join(ROOT, 'data/official-zh.json')
BATCH = 10
WORKERS = 8
MODEL = 'workbuddy/deepseek-v4.1-flash'
API = 'http://127.0.0.1:3425/v1/chat/completions'

GLOSSARY = {
    'Auto layout': '自动布局',
    'Frame': '画板', 'Artboard': '画板',
    'Layer': '图层', 'Layers': '图层',
    'Group': '编组', 'Ungroup': '取消编组',
    'Component': '组件', 'Components': '组件',
    'Instance': '实例', 'Variants': '变体', 'Variant': '变体',
    'Symbol': '符号', 'Symbols': '符号',
    'Fill': '填充', 'Fills': '填充',
    'Stroke': '描边', 'Strokes': '描边', 'Stroke paint': '描边填充',
    'Shadow': '阴影', 'Inner shadow': '内阴影', 'Drop shadow': '投影',
    'Blur': '模糊', 'Background blur': '背景模糊',
    'Opacity': '不透明度',
    'Corner radius': '圆角', 'Radius': '圆角',
    'Constraints': '约束', 'Resizing': '调整尺寸',
    'Align': '对齐', 'Distribute': '分布',
    'Prototype': '原型', 'Prototyping': '原型',
    'Flow': '流程', 'Flows': '流程',
    'Interaction': '交互', 'Overlay': '浮层',
    'Mask': '蒙版', 'Boolean operation': '布尔运算',
    'Vector': '矢量', 'Path': '路径', 'Pen': '钢笔',
    'Slice': '切片', 'Export': '导出', 'Import': '导入',
    'Canvas': '画布', 'Page': '页面', 'Pages': '页面',
    'Inspector': '检查器', 'Assets': '素材', 'Asset': '素材',
    'Library': '组件库', 'Libraries': '组件库',
    'Toolbar': '工具栏', 'Tool': '工具', 'Tools': '工具',
    'View': '视图', 'Zoom': '缩放',
    'Pixel grid': '像素网格', 'Layout grid': '布局网格',
    'Ruler': '标尺', 'Rulers': '标尺', 'Guide': '参考线', 'Guides': '参考线',
    'Snap': '对齐', 'Snapping': '对齐',
    'Show': '显示', 'Hide': '隐藏', 'Show/Hide': '显示/隐藏',
    'Edit': '编辑', 'Undo': '撤销', 'Redo': '重做',
    'Duplicate': '创建副本', 'Paste': '粘贴', 'Copy': '复制',
    'Delete': '删除', 'Move': '移动', 'Rename': '重命名',
    'Bring to front': '置于顶层', 'Send to back': '置于底层',
    'Forward': '上移一层', 'Backward': '下移一层',
    'Flip horizontal': '水平翻转', 'Flip vertical': '垂直翻转',
    'Rotate': '旋转', 'Scale': '缩放',
    'Text': '文本', 'Typography': '排版',
    'Font': '字体', 'Font size': '字号', 'Font weight': '字重',
    'Line height': '行高', 'Letter spacing': '字距',
    'Align left': '左对齐', 'Align center': '居中对齐', 'Align right': '右对齐',
    'Justified': '两端对齐',
    'Color': '颜色', 'Gradient': '渐变', 'Stops': '色标',
    'Effect': '效果', 'Effects': '效果', 'Noise': '噪点', 'Texture': '纹理',
    'Glass': '玻璃', 'Shader': '着色器',
    'Tidy and polish': '整理与润色', 'Generate designs': '生成设计',
    'Build with code': '用代码构建', 'Create plugins and shaders': '创建插件和着色器',
    'Ask for changes': '请求修改', "What's next?": '接下来做什么？',
    'Fill in missing states': '补全缺失状态', 'Add variations': '添加变体',
    'Extend flow': '扩展流程', 'Improve roughest screen': '优化最粗糙的页面',
    'Summarize page': '总结页面',
}

def load_json(p, default):
    try:
        with open(p) as f: return json.load(f)
    except Exception: return default

def call(prompt):
    body = {
        'model': MODEL,
        'messages': [
            {'role': 'system', 'content': '你是专业的 Figma / Sketch 界面本地化译者。把英文 UI 文案翻译成简体中文，严格使用设计师熟悉的界面术语（参考 Sketch 官方中文译法），不要意译成口语。只输出一个合法 JSON 对象：key 必须是输入英文原字符串，value 是中文译文；不要 markdown、不要解释。保留 Figma、FigJam、Make、Buzz、Slides、AI 等产品名；保留 {name}、%s、⌘、⇧ 等占位符和快捷键符号不变。'},
            {'role': 'user', 'content': '术语参考：\n' + '\n'.join(f'{k}={v}' for k,v in GLOSSARY.items()) + '\n\n逐条翻译下面的英文数组，返回 JSON 对象：\n' + json.dumps(prompt, ensure_ascii=False)}
        ],
        'temperature': 0,
        'max_tokens': 8000,
    }
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=180) as f:
        data = json.load(f)
    text = data['choices'][0]['message']['content'].strip()
    text = re.sub(r'^```(?:json)?\s*|\s*```$', '', text)
    a, b = text.find('{'), text.rfind('}')
    if a < 0 or b < a: raise ValueError('no json')
    return json.loads(text[a:b+1])

def main():
    en = json.load(open(EN))
    strings = []
    for k, v in en.items():
        s = v.get('string') if isinstance(v, dict) else None
        if isinstance(s, str) and s.strip():
            strings.append(s.strip())
    strings = list(dict.fromkeys(strings))
    custom = load_json(os.path.join(ROOT, 'dist/dict.zh.json'), {})
    cache = load_json(CACHE, {})
    todo = [s for s in strings if s not in custom and s not in cache]
    print(f'total {len(strings)}, custom {len(custom)}, cached {len(cache)}, todo {len(todo)}', flush=True)
    batches = [todo[i:i+BATCH] for i in range(0, len(todo), BATCH)]
    lock = threading.Lock()
    done = 0
    def work(batch):
        try: return batch, call(batch)
        except Exception as e: return batch, {'__error__': str(e)}
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = [ex.submit(work, b) for b in batches]
        for fut in as_completed(futs):
            batch, res = fut.result()
            with lock:
                if '__error__' not in res:
                    for s in batch:
                        z = res.get(s)
                        if isinstance(z, str) and z.strip() and re.search(r'[\u4e00-\u9fff]', z):
                            cache[s] = z.strip()
                done += 1
                if done % 10 == 0 or done == len(batches):
                    json.dump(cache, open(CACHE, 'w'), ensure_ascii=False)
                    print(f'progress {done}/{len(batches)} cache={len(cache)}', flush=True)
    # 最终合并：机器翻译 + 自研词表 + 术语表
    final = dict(cache)
    for k, v in GLOSSARY.items():
        if k in final: final[k] = v
    for k, v in custom.items():
        final[k] = v
    json.dump(final, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'done final={len(final)} missing={len([s for s in strings if s not in final])}', flush=True)

if __name__ == '__main__':
    main()
