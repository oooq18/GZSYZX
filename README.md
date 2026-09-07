# 广州实验中学官网

广州实验中学（Guangzhou Experimental Secondary School）静态官网，基于纯 HTML + CSS + JavaScript 构建，部署于 GitHub Pages。

## 页面结构

| 页面 | 文件 | 说明 |
|------|------|------|
| 首页 | `index.html` | 学校概览、二维码导航 |
| 学校简介 | `about.html` | 学校历史、定位、规模介绍 |
| 办学条件 | `condition.html` | 师资力量、办学设施 |
| 办学理念 | `philosophy.html` | 教学愿景、办学规划 |

## 技术栈

- **HTML5** — 语义化标签
- **CSS3** — 响应式布局，支持平板/手机适配
- **原生 JavaScript** — 滚动动画、头部交互（无框架依赖）
- **字体方案（流浪地球2）** — 中文标题：字魂创粗黑；英文/数字：Rajdhani Medium；倒计时数字：DIN 1451；正文：微软雅黑

## 本地开发

直接用浏览器打开 `index.html` 即可预览，无需构建工具。

```bash
# 或启动本地服务器
python3 -m http.server 8000
```

## 部署

推送到 `main` 分支后自动部署到 GitHub Pages。

**自定义域名**：gzsyzx.l.cd（通过 CNAME 文件配置）

DNS 需添加 CNAME 记录指向 `oooq18.github.io`。

## 校训

研精覃思 · 循真至美
