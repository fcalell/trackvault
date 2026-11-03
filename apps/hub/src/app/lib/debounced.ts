import { useEffect, useState } from "react";

// A value that follows `value` once it has held still for `ms`: the search box
// types at once, the hub is asked when the typing pauses.
export function useDebounced<T>(value: T, ms: number): T {
	const [held, setHeld] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setHeld(value), ms);
		return () => clearTimeout(timer);
	}, [value, ms]);
	return held;
}
