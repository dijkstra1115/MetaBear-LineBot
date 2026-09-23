// Keep established simulation coordinates; convert only at presentation boundaries.
export const bearPrice = (value) => Math.round((value - 68420) * 2 + 100);
export const bearSize = (value) => Math.round(value * 200);
export const integer = (value) => Math.round(value).toLocaleString("en-US");
export const legacyPrice = (value) => integer(bearPrice(value));
export const legacySize = (value) => integer(bearSize(value));
