import { createContext, useContext } from "react";

/**
 * 面板是否正在渲染。AppShell 提供该值；
 * 项目布局用它决定页内视图 Tab 是否需要兜底显示。
 */
export const PanelOpenContext = createContext<boolean>(true);

export function usePanelOpen(): boolean {
  return useContext(PanelOpenContext);
}
