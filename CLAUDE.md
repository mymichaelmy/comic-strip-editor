# long-strip-demo — CLAUDE.md

## 项目简介
长条漫画分镜裁剪 Demo。左侧 Canvas 编辑器浏览长条图，右侧展示裁出的分镜缩略图。
核心目标：**超长图片下的流畅交互体验**。

## 技术栈
- React 18 + Vite + TypeScript
- 纯 Canvas 渲染（无 CSS transform、无 DOM 图层）

## 常用命令
```bash
npm run dev      # 开发服务器
npm run build    # 构建
npm run preview  # 预览构建产物
```

## 文件结构
```
src/
  App.tsx                          # 根组件，状态集中管理
  types.ts                         # 所有共享类型
  index.css                        # 全局样式
  utils/
    image.ts                       # 图片加载、合成预览、rect clamp
    rect.ts                        # 坐标变换、hit test、rect 工具
  hooks/
    useRafRender.ts                # rAF 节流渲染调度
  components/
    CanvasStripEditor.tsx          # 主编辑器（双层 canvas）
    ThumbList.tsx                  # 右侧缩略图列表
```

## 性能架构要点
1. **双层 Canvas**：bg canvas 画图片（低频），overlay canvas 画分镜框（高频）
2. **高频状态走 ref**：view、dragMode、tempRect、hoverRectId、activeRectId 全部用 ref，避免 React re-render
3. **rAF 节流**：pointer/wheel 事件只 schedule 渲染，不直接重绘
4. **拖动中不 setState**：move 时直接改 `rectsRef.current`，只在 pointerUp 时 flush 到 React state
5. **缩略图 debounce**：120ms 后批量生成，不在拖动过程中重裁

## 关键实现细节
- `onWheel` 必须用原生 `addEventListener('wheel', fn, { passive: false })` 绑定，
  React 合成事件无法 `preventDefault()` 导致触控板会透穿滚动页面
- 事件只绑在 overlay canvas 上，bg canvas 不绑任何事件
- `render()` 函数只读 ref，不捕获 prop，保持函数引用稳定

## 下一步计划（待实现）
- [ ] resize handle：8 个方向拖拽缩放分镜框
- [ ] 自动识别分镜（AI / 边缘检测）
- [ ] full-res 精裁导出（从原始 ImageBitmap 裁，而非 preview canvas）
- [ ] OffscreenCanvas + Worker 渲染
- [ ] 超大图 tile 分块加载
- [ ] 缩略图 LRU 缓存
