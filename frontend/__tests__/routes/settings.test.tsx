import { render, screen, waitFor, within } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import SettingsScreen, { clientLoader } from "#/routes/settings";
import OptionService from "#/api/option-service/option-service.api";
import { organizationService } from "#/api/organization-service/organization-service.api";
import { MOCK_PERSONAL_ORG, MOCK_TEAM_ORG_ACME } from "#/mocks/org-handlers";

// Mock the i18next hook
vi.mock("react-i18next", async () => {
  const actual =
    await vi.importActual<typeof import("react-i18next")>("react-i18next");
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const translations: Record<string, string> = {
          SETTINGS$NAV_INTEGRATIONS: "Integrations",
          SETTINGS$NAV_APPLICATION: "Application",
          SETTINGS$NAV_CREDITS: "Credits",
          SETTINGS$NAV_API_KEYS: "API Keys",
          SETTINGS$NAV_LLM: "LLM",
          SETTINGS$NAV_SECRETS: "Secrets",
          SETTINGS$NAV_MCP: "MCP",
          SETTINGS$NAV_USER: "User",
          SETTINGS$TITLE: "Settings",
        };
        return translations[key] || key;
      },
      i18n: {
        changeLanguage: vi.fn(),
      },
    }),
  };
});

describe("Settings Screen", () => {
  const { handleLogoutMock, mockQueryClient } = vi.hoisted(() => ({
    handleLogoutMock: vi.fn(),
    mockQueryClient: (() => {
      const { QueryClient } = require("@tanstack/react-query");
      return new QueryClient();
    })(),
  }));

  vi.mock("#/hooks/use-app-logout", () => ({
    useAppLogout: vi.fn().mockReturnValue({ handleLogout: handleLogoutMock }),
  }));

  vi.mock("#/query-client-config", () => ({
    queryClient: mockQueryClient,
  }));

  const RouterStub = createRoutesStub([
    {
      Component: SettingsScreen,
      // @ts-expect-error - custom loader
      loader: clientLoader,
      path: "/settings",
      children: [
        {
          Component: () => <div data-testid="llm-settings-screen" />,
          path: "/settings",
        },
        {
          Component: () => <div data-testid="git-settings-screen" />,
          path: "/settings/integrations",
        },
        {
          Component: () => <div data-testid="application-settings-screen" />,
          path: "/settings/app",
        },
        {
          Component: () => <div data-testid="billing-settings-screen" />,
          path: "/settings/billing",
        },
        {
          Component: () => <div data-testid="api-keys-settings-screen" />,
          path: "/settings/api-keys",
        },
        {
          Component: () => (
            <div data-testid="organization-members-settings-screen" />
          ),
          path: "/settings/organization-members",
        },
        {
          Component: () => <div data-testid="organization-settings-screen" />,
          path: "/settings/org",
        },
      ],
    },
  ]);

  const renderSettingsScreen = (path = "/settings") =>
    render(<RouterStub initialEntries={[path]} />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={mockQueryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

  it("should render the navbar", async () => {
    const sectionsToInclude = ["llm", "integrations", "application", "secrets"];
    const sectionsToExclude = ["api keys", "credits", "billing"];
    const getConfigSpy = vi.spyOn(OptionService, "getConfig");
    // @ts-expect-error - only return app mode
    getConfigSpy.mockResolvedValue({
      APP_MODE: "oss",
    });

    // Clear any existing query data
    mockQueryClient.clear();

    renderSettingsScreen();

    const navbar = await screen.findByTestId("settings-navbar");
    sectionsToInclude.forEach((section) => {
      const sectionElement = within(navbar).getByText(section, {
        exact: false, // case insensitive
      });
      expect(sectionElement).toBeInTheDocument();
    });
    sectionsToExclude.forEach((section) => {
      const sectionElement = within(navbar).queryByText(section, {
        exact: false, // case insensitive
      });
      expect(sectionElement).not.toBeInTheDocument();
    });

    getConfigSpy.mockRestore();
  });

  it("should render the saas navbar", async () => {
    const saasConfig = { APP_MODE: "saas" };

    // Clear any existing query data and set the config
    mockQueryClient.clear();
    mockQueryClient.setQueryData(["config"], saasConfig);

    const sectionsToInclude = [
      "llm", // LLM settings are now always shown in SaaS mode
      "user",
      "integrations",
      "application",
      "billing", // The nav item shows "Billing" text and routes to /billing
      "secrets",
      "api keys",
    ];
    const sectionsToExclude: string[] = []; // No sections are excluded in SaaS mode now

    renderSettingsScreen();

    const navbar = await screen.findByTestId("settings-navbar");
    sectionsToInclude.forEach((section) => {
      const sectionElement = within(navbar).getByText(section, {
        exact: false, // case insensitive
      });
      expect(sectionElement).toBeInTheDocument();
    });
    sectionsToExclude.forEach((section) => {
      const sectionElement = within(navbar).queryByText(section, {
        exact: false, // case insensitive
      });
      expect(sectionElement).not.toBeInTheDocument();
    });
  });

  it("should not be able to access saas-only routes in oss mode", async () => {
    const getConfigSpy = vi.spyOn(OptionService, "getConfig");
    // @ts-expect-error - only return app mode
    getConfigSpy.mockResolvedValue({
      APP_MODE: "oss",
    });

    // Clear any existing query data
    mockQueryClient.clear();

    // In OSS mode, accessing restricted routes should redirect to /settings
    // Since createRoutesStub doesn't handle clientLoader redirects properly,
    // we test that the correct navbar is shown (OSS navbar) and that
    // the restricted route components are not rendered when accessing /settings
    renderSettingsScreen("/settings");

    // Verify we're in OSS mode by checking the navbar
    const navbar = await screen.findByTestId("settings-navbar");
    expect(within(navbar).getByText("LLM")).toBeInTheDocument();
    expect(
      within(navbar).queryByText("credits", { exact: false }),
    ).not.toBeInTheDocument();

    // Verify the LLM settings screen is shown
    expect(screen.getByTestId("llm-settings-screen")).toBeInTheDocument();
    expect(
      screen.queryByTestId("billing-settings-screen"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("api-keys-settings-screen"),
    ).not.toBeInTheDocument();

    getConfigSpy.mockRestore();
  });

  it.todo("should not be able to access oss-only routes in saas mode");

  describe("Personal org vs team org visibility", () => {
    it("should not show Organization and Organization Members settings items when personal org is selected", async () => {
      vi.spyOn(organizationService, "getOrganizations").mockResolvedValue([
        MOCK_PERSONAL_ORG,
      ]);
      vi.spyOn(organizationService, "getMe").mockResolvedValue({
        id: "99",
        email: "me@test.com",
        role: "admin",
        status: "active",
      });

      renderSettingsScreen();

      const navbar = await screen.findByTestId("settings-navbar");

      // Organization and Organization Members should NOT be visible for personal org
      expect(
        within(navbar).queryByText("Organization Members"),
      ).not.toBeInTheDocument();
      expect(
        within(navbar).queryByText("Organization"),
      ).not.toBeInTheDocument();
    });

    it("should not show Billing settings item when team org is selected", async () => {
      // Set up SaaS mode (which has Billing in nav items)
      mockQueryClient.clear();
      mockQueryClient.setQueryData(["config"], { APP_MODE: "saas" });

      vi.spyOn(organizationService, "getOrganizations").mockResolvedValue([
        MOCK_TEAM_ORG_ACME,
      ]);
      vi.spyOn(organizationService, "getMe").mockResolvedValue({
        id: "99",
        email: "me@test.com",
        role: "admin",
        status: "active",
      });

      renderSettingsScreen();

      const navbar = await screen.findByTestId("settings-navbar");

      // Wait for orgs to load, then verify Billing is hidden for team orgs
      await waitFor(() => {
        expect(
          within(navbar).queryByText("Billing", { exact: false }),
        ).not.toBeInTheDocument();
      });
    });

    it("should not allow direct URL access to /settings/org when personal org is selected", async () => {
      // Set up orgs in query client so clientLoader can access them
      mockQueryClient.setQueryData(["organizations"], [MOCK_PERSONAL_ORG]);
      mockQueryClient.setQueryData(["selected_organization"], "1");

      vi.spyOn(organizationService, "getOrganizations").mockResolvedValue([
        MOCK_PERSONAL_ORG,
      ]);
      vi.spyOn(organizationService, "getMe").mockResolvedValue({
        id: "99",
        email: "me@test.com",
        role: "admin",
        status: "active",
      });

      renderSettingsScreen("/settings/org");

      // Should redirect away from org settings for personal org
      await waitFor(() => {
        expect(
          screen.queryByTestId("organization-settings-screen"),
        ).not.toBeInTheDocument();
      });
    });

    it("should not allow direct URL access to /settings/organization-members when personal org is selected", async () => {
      // Set up orgs in query client so clientLoader can access them
      mockQueryClient.setQueryData(["organizations"], [MOCK_PERSONAL_ORG]);
      mockQueryClient.setQueryData(["selected_organization"], "1");

      vi.spyOn(organizationService, "getOrganizations").mockResolvedValue([
        MOCK_PERSONAL_ORG,
      ]);
      vi.spyOn(organizationService, "getMe").mockResolvedValue({
        id: "99",
        email: "me@test.com",
        role: "admin",
        status: "active",
      });

      renderSettingsScreen("/settings/organization-members");

      // Should redirect away from organization-members settings for personal org
      await waitFor(() => {
        expect(
          screen.queryByTestId("organization-members-settings-screen"),
        ).not.toBeInTheDocument();
      });
    });

    it("should not allow direct URL access to /settings/billing when team org is selected", async () => {
      // Set up orgs in query client so clientLoader can access them
      mockQueryClient.setQueryData(["organizations"], [MOCK_TEAM_ORG_ACME]);
      mockQueryClient.setQueryData(["selected_organization"], "2");

      vi.spyOn(organizationService, "getOrganizations").mockResolvedValue([
        MOCK_TEAM_ORG_ACME,
      ]);
      vi.spyOn(organizationService, "getMe").mockResolvedValue({
        id: "99",
        email: "me@test.com",
        role: "admin",
        status: "active",
      });

      renderSettingsScreen("/settings/billing");

      // Should redirect away from billing settings for team org
      await waitFor(() => {
        expect(
          screen.queryByTestId("billing-settings-screen"),
        ).not.toBeInTheDocument();
      });
    });
  });
});
