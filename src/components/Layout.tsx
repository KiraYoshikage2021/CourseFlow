import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, FolderKanban, CalendarDays, Flame, FileJson, Settings, Sun, Moon } from "lucide-react";
import { useThemeStore } from "../store/useThemeStore";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "总览" },
  { to: "/projects",  icon: FolderKanban,    label: "项目" },
  { to: "/schedule",  icon: CalendarDays,    label: "周计划" },
  { to: "/habits",    icon: Flame,           label: "习惯" },
  { to: "/import",    icon: FileJson,        label: "导入" },
  { to: "/settings",  icon: Settings,        label: "设置" },
];

export default function Layout() {
  const { theme, toggle } = useThemeStore();

  return (
    <div className="flex h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* 侧边栏 */}
      <aside className="w-52 bg-[var(--bg-card)] flex flex-col py-6 px-3 gap-1 border-r border-[var(--border-default)]">
        <div className="text-xl font-bold text-[var(--text-primary)] px-3 mb-6">CourseFlow</div>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-indigo-600 text-white"
                  : "text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        {/* 底部主题切换 */}
        <div className="mt-auto pt-4">
          <button
            onClick={toggle}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm w-full text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            {theme === "dark" ? "浅色模式" : "深色模式"}
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}