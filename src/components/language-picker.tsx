import { useState } from "react";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LANGUAGES, flagFor } from "@/lib/translation/languages";
import { cn } from "@/lib/utils";
import { Button } from '@/components/ui/button';
import { languageOptions } from '@/lib/language-options';

type Props = {
  value: string;
  onChange: (code: string) => void;
  includeAuto?: boolean;
  placeholder?: string;
  className?: string;
  includeMixed?: boolean;
  label?: string;
};

export function LanguagePicker({ value, onChange, includeAuto = false, includeMixed = includeAuto, placeholder = "Select language…", className, label = 'Language' }: Props) {
  const [open, setOpen] = useState(false);
  const list = languageOptions(includeAuto, includeMixed);
  const selected = LANGUAGES.find((l) => l.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline"
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          className={cn(
            "h-11 min-w-0 max-w-full items-center justify-between gap-2 px-3 text-sm",
            className,
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                <span>{selected.code === "auto" ? "🌐" : selected.code === "multi" ? "🌐+" : flagFor(selected.code)}</span>
                <span className="truncate">{selected.code === "auto" ? "Auto-detect" : selected.code === "multi" ? "Multi-language" : selected.name}</span>
              </>
            ) : (
              <>
                <Globe className="h-3.5 w-3.5 opacity-60" />
                <span className="text-muted-foreground">{placeholder}</span>
              </>
            )}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(360px,calc(100vw-2rem))] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const s = search.toLowerCase();
            return itemValue.toLowerCase().includes(s) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search name, native script or code…" />
          <CommandList>
            <CommandEmpty>No language found.</CommandEmpty>
            <CommandGroup>
              {list.map((l) => {
                const isMulti = l.code === "multi";
                const isAuto = l.code === "auto";
                const label = isAuto ? "Auto-detect" : isMulti ? "Multi-language (mixed)" : l.name;
                const v = `${label} ${l.native} ${l.code} ${isMulti ? "mixed multilingual code-switching dubbed anime" : ""}`;
                return (
                  <CommandItem
                    className="min-h-11 gap-1"
                    key={l.code}
                    value={v}
                    onSelect={() => {
                      onChange(l.code);
                      setOpen(false);
                    }}
                  >
                    <span className="mr-2">{isAuto ? "🌐" : isMulti ? "🌐+" : flagFor(l.code)}</span>
                    <span className="min-w-0 flex-1"><span className="block">{label}</span><span className="block text-[10px] text-muted-foreground">{l.code}</span></span>
                    {l.native && l.native !== label && (
                      <span className="ml-2 text-xs text-muted-foreground truncate">{l.native}</span>
                    )}
                    <Check className={cn("ml-2 h-4 w-4", value === l.code ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
