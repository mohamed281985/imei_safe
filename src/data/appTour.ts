export interface AppTourStep {
  titleKey: string;
  descriptionKey: string;
  target?: string;
  welcome?: boolean;
}

export const APP_TOUR_STEPS: AppTourStep[] = [
  { titleKey: 'app_tour_welcome_title', descriptionKey: 'app_tour_welcome_description', welcome: true },
  { titleKey: 'app_tour_report_title', descriptionKey: 'app_tour_report_description', target: 'report' },
  { titleKey: 'app_tour_register_title', descriptionKey: 'app_tour_register_description', target: 'register' },
  { titleKey: 'app_tour_search_title', descriptionKey: 'app_tour_search_description', target: 'search' },
  { titleKey: 'app_tour_transfer_title', descriptionKey: 'app_tour_transfer_description', target: 'transfer' },
  { titleKey: 'app_tour_quick_report_title', descriptionKey: 'app_tour_quick_report_description', target: 'quick-report' },
  { titleKey: 'app_tour_status_title', descriptionKey: 'app_tour_status_description', target: 'device-status' },
  { titleKey: 'app_tour_plans_title', descriptionKey: 'app_tour_plans_description' },
  { titleKey: 'app_tour_brands_title', descriptionKey: 'app_tour_brands_description', target: 'brands' },
  { titleKey: 'app_tour_nav_open_title', descriptionKey: 'app_tour_nav_open_description', target: 'navigation-open' },
  { titleKey: 'app_tour_create_open_title', descriptionKey: 'app_tour_create_open_description', target: 'create-open' },
  { titleKey: 'app_tour_create_action_title', descriptionKey: 'app_tour_create_action_description', target: 'create-action' },
];