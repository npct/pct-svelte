import { mount } from 'svelte';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import './app.css';
import App from './App.svelte';

setWorkerUrl(workerUrl);

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
