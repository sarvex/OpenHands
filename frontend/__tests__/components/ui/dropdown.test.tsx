import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { Dropdown } from "#/components/ui/dropdown/dropdown";

const mockOptions = [
  { value: "1", label: "Option 1" },
  { value: "2", label: "Option 2" },
  { value: "3", label: "Option 3" },
];

describe("Dropdown", () => {
  describe("Trigger", () => {
    it("should render a custom trigger button", () => {
      render(<Dropdown options={mockOptions} />);

      const trigger = screen.getByTestId("dropdown-trigger");

      expect(trigger).toBeInTheDocument();
    });

    it("should open dropdown on trigger click", async () => {
      const user = userEvent.setup();
      render(<Dropdown options={mockOptions} />);

      expect(screen.queryByText("Option 1")).not.toBeInTheDocument();

      const trigger = screen.getByTestId("dropdown-trigger");
      await user.click(trigger);

      const listbox = screen.getByRole("listbox");
      expect(listbox).toBeInTheDocument();
      expect(screen.getByText("Option 1")).toBeInTheDocument();
      expect(screen.getByText("Option 2")).toBeInTheDocument();
      expect(screen.getByText("Option 3")).toBeInTheDocument();
    });
  });

  describe("Type-ahead / Search", () => {
    it("should filter options based on input text", async () => {
      const user = userEvent.setup();
      render(<Dropdown options={mockOptions} />);

      const trigger = screen.getByTestId("dropdown-trigger");
      await user.click(trigger);

      const input = screen.getByRole("combobox");
      await user.type(input, "Option 1");

      expect(screen.getByText("Option 1")).toBeInTheDocument();
      expect(screen.queryByText("Option 2")).not.toBeInTheDocument();
      expect(screen.queryByText("Option 3")).not.toBeInTheDocument();
    });

    it("should be case-insensitive by default", async () => {
      const user = userEvent.setup();
      render(<Dropdown options={mockOptions} />);

      const trigger = screen.getByTestId("dropdown-trigger");
      await user.click(trigger);

      const input = screen.getByRole("combobox");
      await user.type(input, "option 1");

      expect(screen.getByText("Option 1")).toBeInTheDocument();
      expect(screen.queryByText("Option 2")).not.toBeInTheDocument();
    });

    it("should show all options when search is cleared", async () => {
      const user = userEvent.setup();
      render(<Dropdown options={mockOptions} />);

      const trigger = screen.getByTestId("dropdown-trigger");
      await user.click(trigger);

      const input = screen.getByRole("combobox");
      await user.type(input, "Option 1");
      await user.clear(input);

      expect(screen.getByText("Option 1")).toBeInTheDocument();
      expect(screen.getByText("Option 2")).toBeInTheDocument();
      expect(screen.getByText("Option 3")).toBeInTheDocument();
    });
  });

  describe("Empty state", () => {
    it("should display empty state when no options provided", async () => {
      const user = userEvent.setup();
      render(<Dropdown options={[]} />);

      const trigger = screen.getByTestId("dropdown-trigger");
      await user.click(trigger);

      expect(screen.getByText("No options")).toBeInTheDocument();
    });

    it("should render custom empty state message", async () => {
      const user = userEvent.setup();
      render(<Dropdown options={[]} emptyMessage="Nothing found" />);

      const trigger = screen.getByTestId("dropdown-trigger");
      await user.click(trigger);

      expect(screen.getByText("Nothing found")).toBeInTheDocument();
    });
  });

  describe("Single selection", () => {
    it("should select an option on click", async () => {
      const user = userEvent.setup();
      render(<Dropdown options={mockOptions} />);

      const trigger = screen.getByTestId("dropdown-trigger");
      await user.click(trigger);

      const option = screen.getByText("Option 1");
      await user.click(option);

      expect(screen.getByRole("combobox")).toHaveValue("Option 1");
    });

    it("should close dropdown after selection", async () => {
      const user = userEvent.setup();
      render(<Dropdown options={mockOptions} />);

      const trigger = screen.getByTestId("dropdown-trigger");
      await user.click(trigger);
      await user.click(screen.getByText("Option 1"));

      expect(screen.queryByText("Option 2")).not.toBeInTheDocument();
    });

    it("should display selected option in trigger", async () => {
      const user = userEvent.setup();
      render(<Dropdown options={mockOptions} />);

      const trigger = screen.getByTestId("dropdown-trigger");
      await user.click(trigger);
      await user.click(screen.getByText("Option 1"));

      expect(trigger).toHaveTextContent("Option 1");
    });

    it("should highlight currently selected option in list", async () => {
      const user = userEvent.setup();
      render(<Dropdown options={mockOptions} />);

      const trigger = screen.getByTestId("dropdown-trigger");
      await user.click(trigger);
      await user.click(screen.getByRole("option", { name: "Option 1" }));

      await user.click(trigger);

      const selectedOption = screen.getByRole("option", { name: "Option 1" });
      expect(selectedOption).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("Clear button", () => {
    it("should not render clear button by default", () => {
      render(<Dropdown options={mockOptions} />);

      expect(screen.queryByTestId("dropdown-clear")).not.toBeInTheDocument();
    });

    it("should render clear button when clearable prop is true and has value", async () => {
      const user = userEvent.setup();
      render(<Dropdown options={mockOptions} clearable />);

      const trigger = screen.getByTestId("dropdown-trigger");
      await user.click(trigger);
      await user.click(screen.getByRole("option", { name: "Option 1" }));

      expect(screen.getByTestId("dropdown-clear")).toBeInTheDocument();
    });

    it("should clear selection and search input when clear button is clicked", async () => {
      const user = userEvent.setup();
      render(<Dropdown options={mockOptions} clearable />);

      const trigger = screen.getByTestId("dropdown-trigger");
      await user.click(trigger);
      await user.click(screen.getByRole("option", { name: "Option 1" }));

      const clearButton = screen.getByTestId("dropdown-clear");
      await user.click(clearButton);

      expect(trigger).not.toHaveTextContent("Option 1");
      expect(screen.getByRole("combobox")).toHaveValue("");
    });

    it("should not render clear button when there is no selection", () => {
      render(<Dropdown options={mockOptions} clearable />);

      expect(screen.queryByTestId("dropdown-clear")).not.toBeInTheDocument();
    });
  });

  describe("Loading state", () => {
    it.todo("should display loading indicator when loading prop is true");
    it.todo("should disable interaction while loading");
  });

  describe("Disabled state", () => {
    it.todo("should not open dropdown when disabled");
    it.todo("should apply disabled styling to trigger");
    it.todo("should not respond to keyboard events when disabled");
  });

  describe("Placeholder", () => {
    it.todo("should display placeholder text when no value selected");
    it.todo("should hide placeholder when value is selected");
  });

  describe("Controlled mode", () => {
    it.todo("should reflect external value changes");
    it.todo("should call onChange when selection changes");
    it.todo("should not update internal state when controlled");
  });

  describe("Uncontrolled mode", () => {
    it.todo("should manage selection state internally");
    it.todo("should call onChange when selection changes");
    it.todo("should support defaultValue prop");
  });

  describe("Default value", () => {
    it.todo("should initialize with defaultValue in uncontrolled mode");
    it.todo("should display defaultValue in trigger on mount");
  });

  describe("onChange", () => {
    it.todo("should call onChange with selected item when option is clicked");
    it.todo("should call onChange with null when selection is cleared");
  });
});
