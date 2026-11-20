import { type ReactNode } from "react";
import { Navbar } from "./nav/navbar";
import { Footer } from "./footer";

export const Layout: React.FC<{ children: ReactNode }> = (props) => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-start">
      <div className="flex w-full flex-col items-center">
        <a className="governance-skip-link" href="#governance-content" onClick={(event) => {
          event.preventDefault();
          document.getElementById("governance-content")?.focus();
        }}>Skip to content</a>
        <Navbar />
        <main id="governance-content" tabIndex={-1} className="w-full">{props.children}</main>
      </div>
      <Footer />
    </div>
  );
};
