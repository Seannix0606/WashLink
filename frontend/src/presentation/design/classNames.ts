type ClassNameValue = string | false | null | undefined

export function joinClassNames(...classNameValues: readonly ClassNameValue[]): string {
  return classNameValues
    .filter((classNameValue): classNameValue is string => Boolean(classNameValue))
    .join(' ')
}
