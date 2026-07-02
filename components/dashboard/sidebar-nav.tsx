'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/auth-context'
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Award,
  Bell,
  Users,
  BarChart3,
  Shield,
  PlusCircle,
  GraduationCap,
  Settings,
  TrendingUp,
} from 'lucide-react'

type NavItem = {
  label: string
  href: string
  icon: React.ElementType
  badge?: string
}

const STUDENT_NAV: NavItem[] = [
  { label: 'Overview',     href: '/dashboard/student',              icon: LayoutDashboard },
  { label: 'My Courses',   href: '/dashboard/student/courses',      icon: BookOpen },
  { label: 'My Progress',  href: '/dashboard/student/courses',      icon: TrendingUp },
  { label: 'Quizzes',      href: '/dashboard/student/quizzes',      icon: ClipboardList },
  { label: 'Certificates', href: '/dashboard/student/certificates', icon: Award },
  { label: 'Notifications',href: '/dashboard/notifications',        icon: Bell },
]

const TUTOR_NAV: NavItem[] = [
  { label: 'Overview',      href: '/dashboard/tutor',              icon: LayoutDashboard },
  { label: 'My Courses',    href: '/dashboard/tutor/courses',      icon: BookOpen },
  { label: 'Create Course', href: '/dashboard/tutor/courses/new',  icon: PlusCircle },
  { label: 'Students',      href: '/dashboard/tutor/students',     icon: GraduationCap },
  { label: 'Quizzes',       href: '/dashboard/tutor/quizzes',      icon: ClipboardList },
  { label: 'Notifications', href: '/dashboard/notifications',      icon: Bell },
]

const ADMIN_NAV: NavItem[] = [
  { label: 'Overview',      href: '/dashboard/admin',              icon: LayoutDashboard },
  { label: 'Users',         href: '/dashboard/admin/users',        icon: Users },
  { label: 'Courses',       href: '/dashboard/admin/courses',      icon: BookOpen },
  { label: 'Analytics',     href: '/dashboard/admin/analytics',    icon: BarChart3 },
  { label: 'Audit Log',     href: '/dashboard/admin/audit',        icon: Shield },
  { label: 'Notifications', href: '/dashboard/notifications',      icon: Bell },
  { label: 'Settings',      href: '/dashboard/admin/settings',     icon: Settings },
]

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  STUDENT: STUDENT_NAV,
  TUTOR: TUTOR_NAV,
  ADMIN: ADMIN_NAV,
}

export function SidebarNav() {
  const pathname = usePathname()
  const { user } = useAuth()

  if (!user) return null

  const items = NAV_BY_ROLE[user.role] ?? STUDENT_NAV

  return (
    <nav aria-label="Dashboard navigation">
      <ul className="space-y-0.5">
        {items.map((item) => {
          const isActive =
            item.href === `/dashboard/${user.role.toLowerCase()}`
              ? pathname === item.href
              : pathname.startsWith(item.href)

          return (
            <li key={item.label + item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    isActive ? 'text-indigo-600' : 'text-gray-400',
                  )}
                  aria-hidden="true"
                />
                {item.label}
                {item.badge && (
                  <span className="ml-auto rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                    {item.badge}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}