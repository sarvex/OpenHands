import { screen, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { OrgSelector } from "#/components/features/org/org-selector";
import { organizationService } from "#/api/organization-service/organization-service.api";
import {
  MOCK_PERSONAL_ORG,
  MOCK_TEAM_ORG_ACME,
  createMockOrganization,
} from "#/mocks/org-handlers";

vi.mock("react-router", () => ({
  useRevalidator: () => ({ revalidate: vi.fn() }),
}));

const renderOrgSelector = () =>
  render(<OrgSelector />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={new QueryClient()}>
        {children}
      </QueryClientProvider>
    ),
  });

describe("OrgSelector", () => {
  it("should show a loading indicator when fetching organizations", () => {
    vi.spyOn(organizationService, "getOrganizations").mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    renderOrgSelector();

    const selector = screen.getByTestId("org-selector");
    expect(selector).toBeDisabled();
  });

  it("should select the first organization after orgs are loaded", async () => {
    vi.spyOn(organizationService, "getOrganizations").mockResolvedValue([
      MOCK_PERSONAL_ORG,
      MOCK_TEAM_ORG_ACME,
    ]);

    renderOrgSelector();

    await waitFor(() => {
      const selector = screen.getByTestId("org-selector");
      expect(selector).toHaveValue("Personal Workspace");
    });
  });

  it("should show all options when the clear button is pressed", async () => {
    const user = userEvent.setup();
    vi.spyOn(organizationService, "getOrganizations").mockResolvedValue([
      MOCK_PERSONAL_ORG,
      MOCK_TEAM_ORG_ACME,
      createMockOrganization("3", "Test Organization", 500),
    ]);

    renderOrgSelector();

    // Wait for the selector to be populated with the first organization
    const selector = await screen.findByTestId("org-selector");
    await waitFor(() => {
      expect(selector).toHaveValue("Personal Workspace");
    });

    // Click to open dropdown
    await user.click(selector);

    // Verify all 3 options are visible
    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option");

    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("Personal Workspace");
    expect(options[1]).toHaveTextContent("Acme Corp");
    expect(options[2]).toHaveTextContent("Test Organization");
  });
});
