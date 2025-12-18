/* eslint-disable react/jsx-props-no-spreading */
import { useState } from "react";
import { useCombobox } from "downshift";
import { ChevronDown, X } from "lucide-react";
import { cn } from "#/utils/utils";

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

  const isDisabled = loading || disabled;

  return (
    <div className="relative w-full">
      <div
        className={cn(
          "bg-tertiary border border-[#717888] rounded w-full p-2",
          "flex items-center gap-2",
          isDisabled && "cursor-not-allowed opacity-60",
        )}
      >
        <input
          {...getInputProps({
            placeholder,
            disabled: isDisabled,
            className: cn(
              "flex-grow outline-none bg-transparent text-white",
              "placeholder:italic placeholder:text-tertiary-alt",
            ),
          })}
        />
        {loading && (
          <div
            className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"
            data-testid="dropdown-loading"
          />
        )}
        {clearable && selectedItem && (
          <button
            type="button"
            data-testid="dropdown-clear"
            onClick={() => selectItem(null)}
            aria-label="Clear selection"
            className="text-white hover:text-gray-300"
          >
            <X size={14} />
          </button>
        )}
        <button
          type="button"
          data-testid="dropdown-trigger"
          {...getToggleButtonProps({
            disabled: isDisabled,
            className: cn("text-white", isDisabled && "cursor-not-allowed"),
          })}
        >
          <ChevronDown
            size={16}
            className={cn("transition-transform", isOpen && "rotate-180")}
          />
        </button>
      </div>
      <div
        className={cn(
          "absolute z-10 w-full mt-1",
          "bg-[#454545] border border-[#727987] rounded-lg",
          "max-h-60 overflow-auto",
          !isOpen && "hidden",
        )}
      >
        <ul {...getMenuProps({ className: "p-1" })}>
          {isOpen && filteredOptions.length === 0 && (
            <li className="px-2 py-2 text-sm text-gray-400 italic">
              {emptyMessage}
            </li>
          )}
          {isOpen &&
            filteredOptions.map((option, index) => (
              <li
                key={option.value}
                {...getItemProps({
                  item: option,
                  index,
                  className: cn(
                    "px-2 py-2 cursor-pointer text-sm rounded-md",
                    "text-white focus:outline-none font-normal",
                    selectedItem?.value === option.value
                      ? "bg-[#C9B974] text-black"
                      : "hover:bg-[#5C5D62]",
                  ),
                })}
              >
                {option.label}
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
