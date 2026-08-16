import { useId } from 'react'

import { Label } from '@/components/ui/label'
import { RadioGroup as RadioGroupPrimitive, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select as SelectPrimitive,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface SelectControlProps {
  label: string
  value: string
  values: readonly string[]
  onChange(value: string): void
  className?: string
}

export function SelectControl({
  label,
  value,
  values,
  onChange,
  className
}: SelectControlProps) {
  const id = useId()

  return (
    <div className={cn('field', className)}>
      <Label className="field-label" htmlFor={id}>{label}</Label>
      <SelectPrimitive value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
        </SelectContent>
      </SelectPrimitive>
    </div>
  )
}

interface RadioGroupControlProps {
  label: string
  name: string
  value: string
  values: readonly string[]
  onChange(value: string): void
}

export function RadioGroupControl({
  label,
  name,
  value,
  values,
  onChange
}: RadioGroupControlProps) {
  return (
    <fieldset className="radio-field">
      <legend>{label}</legend>
      <RadioGroupPrimitive className="radio-options" value={value} onValueChange={onChange} name={name}>
        {values.map(option => {
          const id = `${name}-${option.toLowerCase().replaceAll(' ', '-')}`
          return (
            <Label key={option} htmlFor={id}>
              <RadioGroupItem id={id} value={option} className="size-4 border border-input text-primary" />
              <span>{option}</span>
            </Label>
          )
        })}
      </RadioGroupPrimitive>
    </fieldset>
  )
}
