import React from 'react';
import { InputNumber } from 'antd';

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="linghuiDirector3DField">
    <div className="linghuiDirector3DFieldLabel">{label}</div>
    <div className="linghuiDirector3DFieldBody">{children}</div>
  </div>
);

interface Vec3InputProps {
  value: [number, number, number];
  onChange: (value: [number, number, number]) => void;
}

export const Vec3Input: React.FC<Vec3InputProps> = ({ value, onChange }) => {
  const handle = (idx: number, next: number | null) => {
    const updated = [...value] as [number, number, number];
    updated[idx] = typeof next === 'number' && Number.isFinite(next) ? next : 0;
    onChange(updated);
  };
  const labels = ['X', '高度Y', 'Z'] as const;
  return (
    <div className="linghuiDirector3DVec3">
      {labels.map((axis, idx) => (
        <div key={axis} className="linghuiDirector3DVec3Cell">
          <span className="linghuiDirector3DVec3Axis">{axis}</span>
          <InputNumber size="small" controls={false} value={Number(value[idx].toFixed(2))} onChange={(next) => handle(idx, next as number | null)} />
        </div>
      ))}
    </div>
  );
};
