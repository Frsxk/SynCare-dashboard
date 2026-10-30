// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const navigationState = vi.hoisted(() => ({ pathname: "/workspace" }));
const logoutProps = vi.hoisted(() => vi.fn());

vi.mock("next/navigation.js", () => ({ usePathname: () => navigationState.pathname }));
vi.mock("next/link.js", async () => {
  const React = await import("react");
  return {
    default: ({ href, children, ...rest }: { href: string; children?: unknown } & Record<string, unknown>) =>
      React.createElement("a", { href, ...rest }, children as ReactNode),
  };
});
vi.mock("@/components/auth/session-controls", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/auth/session-controls")>();
  const React = await import("react");
  return {
    ...actual,
    LogoutButton: (props: { csrfToken: string }) => {
      logoutProps(props);
      return React.createElement(actual.LogoutButton, props);
    },
  };
});

import { AccountMenu } from "@/components/layout/account-menu";
import { ModuleNavigation } from "@/components/layout/module-navigation";
import { nurseNavigation } from "@/components/layout/nurse-navigation";
import { Shell } from "@/components/layout/shell";

const account = { displayName: "ID akun: nurse.alpha", principalId: "nurse.alpha", csrfToken: "csrf-fixture" };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  navigationState.pathname = "/workspace";
  logoutProps.mockClear();
});

test("Home navigation exposes /workspace as Beranda while keeping every existing module", () => {
  expect(nurseNavigation[0]).toEqual({ label: "Beranda", href: "/workspace" });
  expect(nurseNavigation.slice(1).map((item) => item.href)).toEqual(["/patients", "/monitoring", "/homecare", "/escalations"]);

  const view = render(createElement(ModuleNavigation, { navigation: nurseNavigation }));
  const nav = screen.getByRole("navigation", { name: "Navigasi perawat" });
  for (const label of ["Pasien", "Pemantauan", "Homecare", "Eskalasi"]) {
    expect(within(nav).getByRole("link", { name: label })).toBeDefined();
  }
  const home = within(nav).getByRole("link", { name: "Beranda" });
  expect(home.getAttribute("href")).toBe("/workspace");
  expect(home.getAttribute("aria-current")).toBe("page");
  view.unmount();

  navigationState.pathname = "/patients";
  render(createElement(ModuleNavigation, { navigation: nurseNavigation }));
  const patientsNav = screen.getByRole("navigation", { name: "Navigasi perawat" });
  expect(within(patientsNav).getByRole("link", { name: "Pasien" }).getAttribute("aria-current")).toBe("page");
  expect(within(patientsNav).getByRole("link", { name: "Beranda" }).getAttribute("aria-current")).toBeNull();
});

test("account trigger announces expanded/controls and opens by pointer, click and keyboard focus", () => {
  const view = render(createElement(AccountMenu, account));
  const trigger = screen.getByRole("button", { name: /Akun aktif/ });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(trigger.getAttribute("aria-controls")).toBeTruthy();

  fireEvent.pointerOver(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  const pointerMenu = screen.getByRole("group", { name: "Menu akun" });
  expect(trigger.getAttribute("aria-controls")).toBe(pointerMenu.id);
  expect(within(pointerMenu).getByRole("button", { name: "Keluar" })).toBeDefined();
  view.unmount();

  const clickView = render(createElement(AccountMenu, account));
  const clickTrigger = screen.getByRole("button", { name: /Akun aktif/ });
  fireEvent.click(clickTrigger);
  expect(clickTrigger.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(clickTrigger);
  expect(clickTrigger.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("group", { name: "Menu akun" })).toBeNull();
  clickView.unmount();

  render(createElement(AccountMenu, account));
  const focusTrigger = screen.getByRole("button", { name: /Akun aktif/ });
  act(() => focusTrigger.focus());
  expect(focusTrigger.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("group", { name: "Menu akun" })).toBeDefined();
});

test("clicking the identity after hover keeps the logout popover available", () => {
  render(createElement(AccountMenu, account));
  const trigger=screen.getByRole("button", { name: /Akun aktif/ });
  fireEvent.pointerOver(trigger);
  fireEvent.pointerDown(trigger);
  fireEvent.pointerUp(trigger);
  fireEvent.click(trigger);
  expect(screen.queryByRole("group", { name: "Menu akun" })).not.toBeNull();
});

test("pointer travel from trigger to popup cannot hide the menu before it is reached", () => {
  vi.useFakeTimers();
  render(createElement(AccountMenu, account));
  const trigger = screen.getByRole("button", { name: /Akun aktif/ });
  fireEvent.pointerOver(trigger);
  const menu = screen.getByRole("group", { name: "Menu akun" });

  fireEvent.pointerOut(trigger, { relatedTarget: document.body });
  act(() => vi.advanceTimersByTime(120));
  expect(screen.queryByRole("group", { name: "Menu akun" })).not.toBeNull();

  fireEvent.pointerOver(menu);
  act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole("group", { name: "Menu akun" })).not.toBeNull();

  fireEvent.pointerOut(menu, { relatedTarget: document.body });
  act(() => vi.advanceTimersByTime(300));
  expect(screen.queryByRole("group", { name: "Menu akun" })).toBeNull();
});

test("Escape and outside pointerdown close the menu without closing on inside interaction", () => {
  render(createElement(AccountMenu, account));
  const trigger = screen.getByRole("button", { name: /Akun aktif/ });
  fireEvent.click(trigger);
  expect(screen.getByRole("group", { name: "Menu akun" })).toBeDefined();
  const logout = within(screen.getByRole("group", { name: "Menu akun" })).getByRole("button", { name: "Keluar" });
  act(() => logout.focus());
  expect(document.activeElement).toBe(logout);

  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("group", { name: "Menu akun" })).toBeNull();
  expect(document.activeElement).toBe(trigger);

  fireEvent.click(trigger);
  const menu = screen.getByRole("group", { name: "Menu akun" });
  fireEvent.pointerDown(menu);
  expect(screen.queryByRole("group", { name: "Menu akun" })).not.toBeNull();

  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("group", { name: "Menu akun" })).toBeNull();
});

test("logout entry reuses the existing LogoutButton with the server-issued csrf token", () => {
  render(createElement(AccountMenu, account));
  fireEvent.click(screen.getByRole("button", { name: /Akun aktif/ }));
  const menu = screen.getByRole("group", { name: "Menu akun" });
  expect(within(menu).getByRole("button", { name: "Keluar" })).toBeDefined();
  expect(logoutProps).toHaveBeenCalledWith({ csrfToken: account.csrfToken });
});

test("narrow viewports keep header wrapping and bound the popup to the viewport", () => {
  render(createElement(Shell, { ...account, navigation: nurseNavigation }));
  const header = screen.getByRole("banner");
  expect(header.className).toContain("workspace-header");
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  expect(css).toMatch(/\.workspace-header\s*\{[^}]*flex-wrap:\s*wrap/);
  expect(css).toMatch(/\.workspace-header\s*>\s*\*\s*\{[^}]*min-width:\s*0/);

  const trigger = screen.getByRole("button", { name: /Akun aktif/ });
  expect(trigger.className).toContain("max-w-full");
  fireEvent.click(trigger);
  const menu = screen.getByRole("group", { name: "Menu akun" });
  expect(menu.className).toContain("right-0");
  expect(menu.style.width).toBe("18rem");
  expect(menu.style.maxWidth).toBe("calc(100vw - 2rem)");
});
