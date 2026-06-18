/**
 * Capitalizes the first letter of a string.
 *
 * @param str - The string to capitalize.
 * @returns The string with the first letter capitalized.
 */
export function capitalizeFirstLetter(str: string) {
  if (!str) return str; // Return the original string if it's empty or undefined
  return str.charAt(0).toUpperCase() + str.toLowerCase().slice(1);
}

/**
 * Formats a numeric ID to show only the first 5 and last 5 digits with ellipsis in the middle.
 *
 * @param id - The ID as a string or bigint.
 * @param n - The number of digits to show from the start and end of the ID.
 * @returns The formatted ID string.
 */
export function formatId(id: string | bigint, digits: number = 5): string {
  const idStr = typeof id === "bigint" ? id.toString() : id;

  if (!idStr || idStr.length <= 10) {
    return idStr;
  }

  return `${idStr.substring(0, digits)}...${idStr.substring(idStr.length - digits)}`;
}
