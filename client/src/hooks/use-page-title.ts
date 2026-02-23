import { useEffect } from "react";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | MyShirtsDope` : "MyShirtsDope";
    return () => {
      document.title = "MyShirtsDope";
    };
  }, [title]);
}
