/* eslint-disable react/jsx-props-no-spreading */
import { useState } from "react";
import { useCombobox } from "downshift";

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  options: DropdownOption[];
  emptyMessage?: string;
  clearable?: boolean;
}

export function Dropdown({
  options,
  emptyMessage = "No options",
  clearable = false,
}: DropdownProps) {
  const [inputValue, setInputValue] = useState("");

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(inputValue.toLowerCase()),
  );

  const {
    isOpen,
    selectedItem,
    selectItem,
    getToggleButtonProps,
    getMenuProps,
    getItemProps,
    getInputProps,
  } = useCombobox({
    items: filteredOptions,
    itemToString: (item) => item?.label ?? "",
    inputValue,
    onInputValueChange: ({ inputValue: newValue }) => {
      setInputValue(newValue ?? "");
    },
  });

  return (
    <div>
      <button
        type="button"
        data-testid="dropdown-trigger"
        {...getToggleButtonProps()}
      >
        {selectedItem?.label}
      </button>
      {clearable && selectedItem && (
        <button
          type="button"
          data-testid="dropdown-clear"
          onClick={() => selectItem(null)}
          aria-label="Clear selection"
        />
      )}
      <input {...getInputProps()} />
      <ul {...getMenuProps()}>
        {isOpen && filteredOptions.length === 0 && <li>{emptyMessage}</li>}
        {isOpen &&
          filteredOptions.map((option, index) => (
            <li key={option.value} {...getItemProps({ item: option, index })}>
              {option.label}
            </li>
          ))}
      </ul>
    </div>
  );
}
