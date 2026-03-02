/**
 * Skeleton loading states for key pages
 * Replace generic <Spin> with layout-accurate skeletons
 */
import React from 'react';

/** Shimmer animation keyframe via inline style */
const shimmerStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
};

/** Inject @keyframes once */
const ShimmerCSS: React.FC = () => (
  <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
);

const SkeletonBlock: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
  <div className={`bg-zinc-800/60 rounded ${className}`} style={{ ...shimmerStyle, ...style }} />
);

/** Skeleton for ProjectList page — mimics project card grid */
export const ProjectListSkeleton: React.FC = () => (
  <div className="p-6 space-y-6">
    <ShimmerCSS />
    {/* Header row */}
    <div className="flex items-center justify-between">
      <SkeletonBlock className="h-8 w-32" />
      <div className="flex gap-3">
        <SkeletonBlock className="h-10 w-48 rounded-lg" />
        <SkeletonBlock className="h-10 w-28 rounded-lg" />
      </div>
    </div>
    {/* Filter tabs */}
    <div className="flex gap-2">
      {[80, 60, 70, 60].map((w, i) => (
        <SkeletonBlock key={i} className="h-8 rounded-full" style={{ width: w }} />
      ))}
    </div>
    {/* Project cards grid */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-xl bg-zinc-900/60 border border-zinc-800/50 overflow-hidden">
          <SkeletonBlock className="h-40 rounded-none" />
          <div className="p-4 space-y-3">
            <SkeletonBlock className="h-5 w-3/4" />
            <div className="flex gap-2">
              <SkeletonBlock className="h-4 w-16 rounded-full" />
              <SkeletonBlock className="h-4 w-20 rounded-full" />
            </div>
            <SkeletonBlock className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** Skeleton for WorkspaceShell — mimics header + stage nav + content */
export const WorkspaceSkeleton: React.FC = () => (
  <div className="flex flex-col h-full">
    <ShimmerCSS />
    {/* Header */}
    <div className="flex items-center gap-4 px-6 py-3 border-b border-zinc-800/50">
      <SkeletonBlock className="h-8 w-8 rounded" />
      <SkeletonBlock className="h-6 w-48" />
      <div className="ml-auto flex gap-2">
        <SkeletonBlock className="h-8 w-24 rounded-lg" />
        <SkeletonBlock className="h-8 w-24 rounded-lg" />
      </div>
    </div>
    {/* Stage navigation */}
    <div className="flex gap-1 px-6 py-2 border-b border-zinc-800/30">
      {[72, 56, 64, 56, 48].map((w, i) => (
        <SkeletonBlock key={i} className="h-9 rounded-lg" style={{ width: w }} />
      ))}
    </div>
    {/* Content area */}
    <div className="flex-1 p-6 space-y-4">
      <SkeletonBlock className="h-6 w-1/3" />
      <SkeletonBlock className="h-32 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-4">
        <SkeletonBlock className="h-24 rounded-xl" />
        <SkeletonBlock className="h-24 rounded-xl" />
      </div>
      <SkeletonBlock className="h-48 w-full rounded-xl" />
    </div>
  </div>
);

/** Skeleton for Settings page */
export const SettingsSkeleton: React.FC = () => (
  <div className="flex h-full">
    <ShimmerCSS />
    {/* Settings sidebar */}
    <div className="w-48 p-4 border-r border-zinc-800/50 space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-9 rounded-lg" />
      ))}
    </div>
    {/* Settings content */}
    <div className="flex-1 p-6 space-y-6">
      <SkeletonBlock className="h-8 w-40" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  </div>
);
