import React, { PropsWithChildren } from "react";
import { RenderOptions, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18n from "i18next";
import { expect, vi } from "vitest";
import { AxiosError } from "axios";
import userEvent from "@testing-library/user-event";
import { INITIAL_MOCK_ORGS } from "#/mocks/org-handlers";

// Mock useParams before importing components
vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useParams: () => ({ conversationId: "test-conversation-id" }),
    useRevalidator: () => ({
      revalidate: vi.fn(),
    }),
  };
});

// Initialize i18n for tests
i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  ns: ["translation"],
  defaultNS: "translation",
  resources: {
    en: {
      translation: {},
    },
  },
  interpolation: {
    escapeValue: false,
  },
});

// This type interface extends the default options for render from RTL
interface ExtendedRenderOptions extends Omit<RenderOptions, "queries"> {}

// Export our own customized renderWithProviders function that renders with QueryClient and i18next providers
// Since we're using Zustand stores, we don't need a Redux Provider wrapper
export function renderWithProviders(
  ui: React.ReactElement,
  renderOptions: ExtendedRenderOptions = {},
) {
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
      </QueryClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

export const createAxiosNotFoundErrorObject = () =>
  new AxiosError(
    "Request failed with status code 404",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status: 404,
      statusText: "Not Found",
      data: { message: "Settings not found" },
      headers: {},
      // @ts-expect-error - we only need the response object for this test
      config: {},
    },
  );

export const selectOrganization = async ({
  orgIndex,
}: {
  orgIndex: number;
}) => {
  const targetOrg = INITIAL_MOCK_ORGS[orgIndex];
  if (!targetOrg) {
    expect.fail(`No organization found at index ${orgIndex}`);
  }

  // Wait for the settings navbar to render (which contains the org selector)
  await screen.findByTestId("settings-navbar");

  // Wait for orgs to load and auto-select to happen (first org gets auto-selected)
  const organizationSelect = await screen.findByTestId("org-selector");
  expect(organizationSelect).toBeInTheDocument();

  // Wait until the dropdown trigger is not disabled (orgs have loaded)
  const trigger = await screen.findByTestId("dropdown-trigger");
  await waitFor(() => {
    expect(trigger).not.toBeDisabled();
  });

  // Get the combobox input (where the value is displayed)
  const combobox = screen.getByRole("combobox");

  // If selecting org index 0, it should already be auto-selected
  if (orgIndex === 0) {
    await waitFor(() => {
      expect(combobox).toHaveValue(targetOrg.name);
    });
    return;
  }

  // Click the trigger to open the dropdown
  await userEvent.click(trigger);

  // Find the option by its role and text content (organization name)
  const option = await screen.findByRole("option", { name: targetOrg.name });
  await userEvent.click(option);

  // Wait for the selection to be reflected in the combobox
  await waitFor(() => {
    expect(combobox).toHaveValue(targetOrg.name);
  });
};
