import type { ComponentProps, ParentProps, ValidComponent } from "solid-js";
import {
	createContext,
	createUniqueId,
	splitProps,
	useContext,
} from "solid-js";
import { Dynamic } from "solid-js/web";

import { cn } from "#lib/cn";

type SectionContextValue = {
	titleId: string;
};

const SectionContext = createContext<SectionContextValue>();

function useSectionContext() {
	const ctx = useContext(SectionContext);
	if (!ctx)
		throw new Error("Section.* components must be used within <Section>");
	return ctx;
}

// --- Section ---

type SectionProps = ParentProps<ComponentProps<"section">>;

const Section = (props: SectionProps) => {
	const [local, rest] = splitProps(props, ["children", "class"]);
	const titleId = createUniqueId();

	return (
		<SectionContext.Provider value={{ titleId }}>
			<section aria-labelledby={titleId} class={cn(local.class)} {...rest}>
				{local.children}
			</section>
		</SectionContext.Provider>
	);
};

// --- SectionHeader ---

type SectionHeaderProps = ParentProps<ComponentProps<"div">>;

const SectionHeader = (props: SectionHeaderProps) => {
	const [local, rest] = splitProps(props, ["children", "class"]);

	return (
		<div
			class={cn(
				"flex items-center justify-between border-b-2 border-border px-6 py-3",
				local.class,
			)}
			{...rest}
		>
			{local.children}
		</div>
	);
};

// --- SectionTitle ---

type SectionTitleProps<T extends ValidComponent = "h2"> = ParentProps<
	ComponentProps<"h2"> & {
		as?: T;
	}
>;

const SectionTitle = <T extends ValidComponent = "h2">(
	props: SectionTitleProps<T>,
) => {
	const ctx = useSectionContext();
	const [local, rest] = splitProps(props as SectionTitleProps, [
		"children",
		"class",
		"as",
	]);

	return (
		<Dynamic
			component={local.as ?? "h2"}
			id={ctx.titleId}
			class={cn("text-2xl font-bold uppercase tracking-widest", local.class)}
			{...rest}
		>
			{local.children}
		</Dynamic>
	);
};

// --- SectionContent ---

type SectionContentProps = ParentProps<ComponentProps<"div">>;

const SectionContent = (props: SectionContentProps) => {
	const [local, rest] = splitProps(props, ["children", "class"]);

	return (
		<div class={cn("px-6 py-6", local.class)} {...rest}>
			{local.children}
		</div>
	);
};

// --- SectionTable ---

type SectionTableProps = ParentProps<ComponentProps<"div">>;

const SectionTable = (props: SectionTableProps) => {
	const [local, rest] = splitProps(props, ["children", "class"]);

	return (
		<div class={cn("w-full", local.class)} {...rest}>
			{local.children}
		</div>
	);
};

// --- SectionToolbar ---

type SectionToolbarProps = ParentProps<ComponentProps<"div">>;

const SectionToolbar = (props: SectionToolbarProps) => {
	const [local, rest] = splitProps(props, ["children", "class"]);

	return (
		<div
			class={cn(
				"flex items-center justify-between gap-3 border-b border-border px-6 py-3",
				local.class,
			)}
			{...rest}
		>
			{local.children}
		</div>
	);
};

export type {
	SectionContentProps,
	SectionHeaderProps,
	SectionProps,
	SectionTableProps,
	SectionTitleProps,
	SectionToolbarProps,
};
export {
	Section,
	SectionContent,
	SectionHeader,
	SectionTable,
	SectionTitle,
	SectionToolbar,
};
