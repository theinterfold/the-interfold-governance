import { TextAreaRichText, type ITextAreaRichTextProps } from "@aragon/ods";
import { useEffect, useId, useRef } from "react";

const toolbarNames = ["Bold", "Italic", "Add or remove link", "Bulleted list", "Numbered list"];

/** Add accessible names missing from the installed ODS rich-text controls. */
export function AccessibleRichText(props: ITextAreaRichTextProps) {
  const marker = `governance-rich-text-${useId().replace(/:/g, "")}`;
  const wasExpanded = useRef<boolean>();

  useEffect(() => {
    const getRoot = () => document.querySelector<HTMLElement>(`.${marker}`);
    const getExpandButton = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>("button")].at(-1);
    const updateNames = () => {
      // ODS portals the same editor root into document.body when expanded.
      const root = getRoot();
      if (!root) return;
      const expanded = root.classList.contains("fixed");

      if (expanded) {
        // The site header sits above the ODS default layer (50). The editor is
        // a full-screen surface and must cover every header control.
        root.style.zIndex = "2000";
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-modal", "true");
        root.setAttribute("aria-label", `${props.label ?? "Rich text"} editor`);
      } else {
        root.style.removeProperty("z-index");
        root.removeAttribute("role");
        root.removeAttribute("aria-modal");
        root.removeAttribute("aria-label");
      }

      const editor = root.querySelector<HTMLElement>('[role="textbox"]');
      if (editor) {
        editor.removeAttribute("aria-labelledby"); // ODS points this at a missing element.
        editor.setAttribute("aria-label", props.label ?? "Rich text editor");
      }

      root.querySelectorAll<HTMLButtonElement>("button").forEach((button, index, buttons) => {
        const name =
          index === buttons.length - 1 ? (expanded ? "Collapse editor" : "Expand editor") : toolbarNames[index];
        if (name && button.getAttribute("aria-label") !== name) button.setAttribute("aria-label", name);
      });

      if (wasExpanded.current !== undefined && wasExpanded.current !== expanded) {
        // The ODS portal remounts the surface; put focus back on its toggle.
        getExpandButton(root)?.focus({ preventScroll: true });
      }
      wasExpanded.current = expanded;
    };

    const keepFocusInsideExpandedEditor = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const root = getRoot();
      if (!root?.classList.contains("fixed")) return;
      const focusable = [
        ...root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [role="textbox"][contenteditable="true"], a[href]'
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (!root.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    updateNames();
    const observer = new MutationObserver(updateNames);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", keepFocusInsideExpandedEditor, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", keepFocusInsideExpandedEditor, true);
    };
  }, [marker, props.label]);

  return <TextAreaRichText {...props} className={`${props.className ?? ""} ${marker}`} />;
}
