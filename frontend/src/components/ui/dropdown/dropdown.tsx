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
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  defaultValue?: DropdownOption;
}

export function Dropdown({
  options,
  emptyMessage = "No options",
  clearable = false,
  loading = false,
  disabled = false,
  placeholder,
  defaultValue,
}: DropdownProps) {
  const [inputValue, setInputValue] = useState(defaultValue?.label ?? "");

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
    defaultSelectedItem: defaultValue,
    onIsOpenChange: ({
      isOpen: newIsOpen,
      selectedItem: currentSelectedItem,
    }) => {
      if (newIsOpen) {
        setInputValue("");
      } else {
        setInputValue(currentSelectedItem?.label ?? "");
      }
    },
  });

  return (
    <div>
      {loading && <span data-testid="dropdown-loading" />}
      <button
        type="button"
        data-testid="dropdown-trigger"
        {...getToggleButtonProps({ disabled: loading || disabled })}
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
      <input {...getInputProps({ placeholder })} />
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
