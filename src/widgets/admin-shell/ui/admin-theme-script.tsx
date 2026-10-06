import { ADMIN_THEME_INIT_SCRIPT } from "../model/theme";

export function AdminThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: ADMIN_THEME_INIT_SCRIPT }} />;
}
