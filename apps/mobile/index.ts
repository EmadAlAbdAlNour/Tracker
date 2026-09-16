import { registerRootComponent } from 'expo';
import { registerBackgroundLocationTask } from './location';
import App from './App';

// Define background tasks in the global scope so headless execution finds them
registerBackgroundLocationTask();

registerRootComponent(App);
