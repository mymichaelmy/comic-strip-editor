# 长条漫画分镜裁剪 Demo

一个面向**超长条漫画**的分镜裁剪工具，核心目标是在几十张大图拼接成的长图下依然保持流畅的交互体验。

## 功能

- **上传多张图片**：按文件名自然排序，自动拼接成竖向长图在左侧预览
- **分镜框绘制**：Shift + 拖拽 绘制裁剪框，或点击「添加分镜框」按钮
- **8 方向缩放**：拖拽分镜框上的 8 个控制点任意调整大小，边界对齐精确
- **移动分镜框**：直接拖拽框体移动位置
- **右侧缩略图**：实时预览每个分镜的裁剪内容，支持拖拽排序
- **导出 ZIP**：从原始图片全分辨率裁剪（1:1 无缩放），打包为 `panels.zip` 下载
- **自定义滚动条**：左侧阅读区滚动条不遮挡图片内容

## 技术栈

- React 18 + Vite + TypeScript
- 纯 Canvas 渲染（无 CSS transform、无 DOM 图层）
- JSZip（ZIP 导出）

## 性能设计

| 手段 | 效果 |
|------|------|
| 双层 Canvas（bg + overlay） | 图片低频重绘，分镜框高频重绘互不影响 |
| 高频状态走 ref | 拖拽过程零 React re-render |
| rAF 节流 | pointer/wheel 事件合并到单帧渲染 |
| 视口裁剪 | 只绘制当前可见的图片分块 |
| 缩略图 debounce（120ms） | 拖拽结束后再批量生成，不卡拖拽 |
| 全整数坐标导出 | 严格 1:1 像素对拷，无插值模糊 |

## 快速开始

```bash
npm install
npm run dev
```

打开浏览器访问 `http://localhost:5173`。

## 使用方式

1. 点击「上传多张图片」选择漫画页（支持 jpg/png/webp 等）
2. 在左侧长图上 **Shift + 拖拽** 划出分镜框，或点击工具栏「添加分镜框」
3. 拖拽框体移动位置，拖拽四角/四边控制点调整大小
4. 右侧缩略图可拖拽排序，点击缩略图跳转到对应位置
5. 点击「导出 ZIP」下载全部分镜的原图精度 PNG

## 文件结构

```
src/
  App.tsx                    # 根组件，状态集中管理
  types.ts                   # 共享类型定义
  index.css                  # 全局样式
  utils/
    image.ts                 # 图片加载、预览合成、rect clamp
    rect.ts                  # 坐标变换、hit test
    export.ts                # 全分辨率裁剪 + ZIP 导出
  hooks/
    useRafRender.ts          # rAF 节流渲染调度
  components/
    CanvasStripEditor.tsx    # 主编辑器（双层 Canvas）
    ThumbList.tsx            # 右侧缩略图列表
```
