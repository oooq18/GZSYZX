# 广州实验中学官网

广州实验中学（Guangzhou Experimental Secondary School）静态官网，基于纯 HTML + CSS + JavaScript 构建，部署于 GitHub Pages。

## 页面结构

| 页面 | 文件 | 说明 |
|------|------|------|
| 首页 | `index.html` | 学校概览、记忆配对小游戏、二维码导航 |
| 学校简介 | `about.html` | 学校历史、定位、规模介绍 |
| 办学条件 | `condition.html` | 师资力量、办学设施 |
| 办学理念 | `philosophy.html` | 教学愿景、办学规划 |

## 技术栈

- **HTML5** — 语义化标签
- **CSS3** — 响应式布局，支持平板/手机适配
- **原生 JavaScript** — 记忆配对卡片游戏（无框架依赖）
- **芝加哥正黑体** — 自定义中文字体（WOFF2 / WOFF）

## 本地开发

直接用浏览器打开 `index.html` 即可预览，无需构建工具。

```bash
# 或启动本地服务器
python3 -m http.server 8000
```

## 部署

推送到 `main` 分支后，在 GitHub 仓库 Settings → Pages 中选择 `main` 分支根目录即可自动部署。

## 校训

研精覃思 · 循真至美
