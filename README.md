# CourseFlow

CourseFlow 是一个面向学习项目和长期任务管理的桌面应用。它把项目、阶段、任务、周计划和习惯追踪放在同一个工作流里，核心目标是回答两个问题：

- 今天应该先做什么？
- 一个较大的学习目标现在推进到哪一步了？

当前版本：`3.0.0`

## 主要功能

### Dashboard

- 今日工作台：集中显示今日任务、今日习惯、逾期任务、待分配任务，并支持快速添加今日任务。
- 周视图 / 月视图切换：默认打开周视图，适合查看本周负载。
- 周视图任务拖拽：可以把任务拖到其他日期，快速调整计划。
- 周视图显示控制：支持舒适/紧凑密度、隐藏已完成任务、项目颜色强调。
- Dashboard 样式偏好：可在设置页切换“工作台”或“卡片”视觉风格。

### Projects

- 项目管理：支持颜色、难度、排序、搜索和进度展示。
- 项目归档：完成或暂时不活跃的项目可以归档，避免占用主要视图。
- 项目详情页：包含概览、任务、统计、设置等视图。
- Overview 驾驶舱：显示当前阶段、下一步推荐任务、逾期任务、未分阶段任务和归档准备度。
- 批量操作：支持多选任务、批量分配阶段、批量标记完成/取消完成。

### Milestones

- 项目下可以创建多个阶段，用于拆分较长的学习目标。
- 阶段支持状态、目标日期、排序和进度统计。
- 任务可以归属到具体阶段，也可以保持未分阶段。
- 项目卡片、Dashboard 任务行和项目详情页都会显示阶段信息。

### Weekly Schedule

- 周计划模板：为每周不同日期安排不同项目。
- 自动排程：把待分配任务按周计划分配到具体日期。
- 预览和撤销：自动排程前可以预览变更，应用后可以撤销最近一次排程。

### Habits

- 创建周期性习惯，并按周一到周日设置打卡日。
- 支持今日打卡、撤销打卡、连续记录统计。
- 提供历史热力图，用于观察长期坚持情况。
- Dashboard 会把今日习惯和今日任务统一显示为今日执行项。

### 数据和备份

- 使用 SQLite 本地数据库保存数据。
- 支持导出 JSON 备份。
- 支持从当前 Tauri 版备份恢复。
- 支持导入旧 Flutter 版备份并迁移字段。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 后端 | Rust, SQLx, SQLite |
| 前端 | React 19, TypeScript, Vite |
| 样式 | Tailwind CSS v4 |
| 状态管理 | Zustand |
| 路由 | React Router 7 |
| 拖拽 | dnd-kit |
| 图标 | lucide-react |

## 本地开发

### 环境要求

- Node.js 18 或更高版本
- Rust stable toolchain
- Tauri 2 所需系统依赖
- Windows 打包需要 NSIS 环境

### 安装依赖

```bash
npm install
```

### 启动前端开发服务器

```bash
npm run dev
```

### 启动 Tauri 开发模式

```bash
npm run tauri dev
```

### 前端构建

```bash
npm run build
```

### 桌面应用打包

```bash
npm run tauri build
```

Windows 下的本地安装包会生成到类似路径：

```text
src-tauri/target/release/bundle/nsis/CourseFlow_3.0.0_x64-setup.exe
```

## 数据存储

应用启动时会在 Tauri 应用数据目录中创建 SQLite 数据库：

```text
courseflow_data.db
```

主要数据表：

- `projects`：项目、颜色、难度、排序、归档状态。
- `milestones`：项目阶段、状态、排序、目标日期。
- `calendar_events`：任务、排期日期、截止日期、完成时间、项目和阶段归属。
- `weekly_template`：每周模板，记录星期与项目的对应关系。
- `habits`：习惯定义和打卡日设置。
- `habit_completions`：习惯按日期的完成记录。

数据库会在启动时自动执行兼容旧版本的轻量迁移。

## 发布流程

项目使用 GitHub Actions 自动发布。推送形如 `v*` 的 tag 会触发 `.github/workflows/release.yml`，自动构建并发布多平台安装包：

- Windows NSIS installer
- macOS DMG
- Linux DEB
- Linux RPM

当前正式 Release：

```text
https://github.com/KiraYoshikage2021/CourseFlow/releases/tag/v3.0.0
```

## 项目结构

```text
courseflow/
  src/                     前端 React 代码
    components/            通用 UI 控件
    pages/                 页面级组件
    store/                 Zustand 状态管理
  src-tauri/               Tauri / Rust 后端
    src/
      commands.rs          Tauri 命令
      db.rs                数据库建表和迁移
      lib.rs               应用入口和命令注册
      models.rs            Rust 数据模型
  .github/workflows/       GitHub Actions 发布流程
  ideas.md                 后续产品和 UI 改进记录
```

## v3.0.0 更新摘要

- 增加项目归档和恢复。
- 增加项目阶段 Milestone。
- 增加项目详情页和行动导向 Overview 驾驶舱。
- 增强 Dashboard 今日工作台、周视图、任务拖拽和显示偏好。
- 增加任务截止日期 `due_date` 和完成时间 `completed_at`。
- 增加批量分配阶段、批量完成/取消完成。
- 增加自动排程预览和撤销。
- 增加统一的表单控件和 Dashboard 样式偏好。

## 备注

CourseFlow 当前更偏个人使用场景，数据默认保存在本地。建议定期使用设置页里的备份功能导出 JSON 文件。
