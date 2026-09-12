import { createApp } from 'vue'
import VueFluentWidgets from 'vue-fluent-widgets'
import 'vue-fluent-widgets/style.css'
import LandingApp from './LandingApp.vue'
import './landing.css'

createApp(LandingApp).use(VueFluentWidgets).mount('#app')
