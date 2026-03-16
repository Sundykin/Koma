import { initRuntimeBootstrap } from '../bootstrap/runtime';

function preload(): void {
  initRuntimeBootstrap();
}

export { preload };
