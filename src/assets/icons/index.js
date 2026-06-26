import 'virtual:svg-icons-register';
import SvgIcon from '@/components/SvgIcon.vue';

export default {
  install(app) {
    app.component('svg-icon', SvgIcon);
  },
};
