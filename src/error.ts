import {EndParseElement, ExactTextParseElement, ParseElement} from "./parse_element.js";
import {LongTextArgType, NaturalNumberArgType, NumberArgType, TimeDurationArgType, WordArgType} from "./arg_type.js";

export class ParseError extends Error {
    source: string;
    problems: ParseProblem[];

    constructor(source: string, problems: ParseProblem[]) {
        super("Failed to parse the specified command");
        this.source = source;
        this.problems = problems;
    }
}

export interface ParseProblem {
    start: number,
    length: number,
    element: ParseElement
}

export interface GroupedParseProblem {
    start: number,
    length: number,
    problems: ParseProblem[]
}

export function groupProblems(errors: ParseProblem[]): GroupedParseProblem[] {
    errors = errors.sort((a, b) => a.start - b.start);
    let groups = [];
    let current: GroupedParseProblem = {start: -1, length: -1, problems: []};
    for (let error of errors) {
        if (current.start !== error.start) {
            current = {start: error.start, length: error.length, problems: []};
            groups.push(current);
        }
        current.problems.push(error);
    }
    return groups;
}

export function findFurthestProblems(errors: ParseProblem[]): ParseProblem[] {
    let furthestStart = -1;
    for (let error of errors)
        if (error.start > furthestStart)
            furthestStart = error.start;
    return errors.filter(x => x.start === furthestStart);
}

export function getElementEnglishDescription(element: ParseElement): string {
    if (element instanceof ExactTextParseElement)
        return "`" + element.text + "`";
    if (element instanceof WordArgType)
        return "a word";
    if (element instanceof LongTextArgType)
        return "text";
    if ((element instanceof NumberArgType) || (element instanceof NaturalNumberArgType))
        return "a number";
    if (element instanceof TimeDurationArgType)
        return "a time duration";
    if (element instanceof EndParseElement)
        return "nothing";
    return "something";
}
export function makeEnglishDescription(errors: ParseProblem[], descriptionProvider: (element: ParseElement) => string = getElementEnglishDescription) {
    let ret = "Expected ";
    for (let i = 0; i < errors.length; i++) {
        if (i > 0)
            ret += i === errors.length - 1 ? " or " : ", ";
        ret += descriptionProvider(errors[i].element);
    }
    return ret;
}