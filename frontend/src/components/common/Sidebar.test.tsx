import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar, type AppView } from './Sidebar';

describe('Sidebar', () => {
  it('triggers view change for key nav items', () => {
    const onViewChange = vi.fn();
    render(<Sidebar view="projects" onViewChange={onViewChange} />);

    fireEvent.click(screen.getByTestId('nav-novel-promotion'));
    fireEvent.click(screen.getByTestId('nav-tasks'));

    expect(onViewChange).toHaveBeenCalledWith('novel-promotion');
    expect(onViewChange).toHaveBeenCalledWith('tasks');
  });

  it('highlights short drama as primary active view', () => {
    const onViewChange = vi.fn();
    render(<Sidebar view={('novel-promotion' as AppView)} onViewChange={onViewChange} />);

    expect(screen.getByTestId('nav-novel-promotion').className).toContain('text-emerald-400');
    expect(screen.getByTestId('nav-projects').className).not.toContain('text-emerald-400');
  });
});
