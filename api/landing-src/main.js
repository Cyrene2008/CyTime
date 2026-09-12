import { createApp, ref } from 'vue'
import VueFluentWidgets from 'vue-fluent-widgets'
import 'vue-fluent-widgets/style.css'
import LandingApp from './LandingApp.vue'
import './landing.css'

const app = createApp(LandingApp)
app.use(VueFluentWidgets)
app.provide('theme', ref('light'))
app.mount('#app')
