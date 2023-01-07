import {isWhitespace, ParseContext} from "./parse_context.js";
import {LongTextArgType} from "./arg_type.js";

export interface ParseElement<UserContext = unknown> {
    readonly optional?: boolean;

    parse(context: ParseContext, userContext: UserContext): boolean;

    getExpectedNumberOfSpaces(prevCharMightBeSpace: boolean): [number, number, boolean];
}

export class WhitespaceParseElement implements ParseElement {
    static instance: WhitespaceParseElement = new WhitespaceParseElement();

    parse(context: ParseContext): boolean {
        return context.eatWhitespace() || (context.offset === 0 || isWhitespace(context.text.charAt(context.offset - 1)));
    }

    getExpectedNumberOfSpaces(prevCharMightBeSpace: boolean): [number, number, boolean] {
        return prevCharMightBeSpace ? [0, 1, true] : [1, 1, true];
    }
}

export class EndParseElement implements ParseElement {
    static instance: EndParseElement = new EndParseElement();

    parse(context: ParseContext): boolean {
        if (!context.eof)
            return context.createError(this);
        return true;
    }

    getExpectedNumberOfSpaces(prevCharMightBeSpace: boolean): [number, number, boolean] {
        return [0, 0, false];
    }
}

export class ContainerParseElement implements ParseElement {
    readonly elements: ParseElement[];

    constructor(elements: ParseElement[]) {
        this.elements = elements;
    }

    parse(context: ParseContext, userContext: any): boolean {
        for (let i = 0; i < this.elements.length; i++) {
            const savedOffset = context.offset;
            let success = this.elements[i].parse(context, userContext);
            if (!success && (!this.elements[i].optional || this.elements[i] instanceof LongTextArgType))
                return false;
            if (!success)
                context.offset = savedOffset;
        }
        return true;
    }

    getExpectedNumberOfSpaces(prevCharMightBeSpace: boolean): [number, number, boolean] {
        let ret: [number, number, boolean] = [0, 0, false];
        for (let i = 0; i < this.elements.length; i++) {
            let s = this.elements[i].getExpectedNumberOfSpaces(prevCharMightBeSpace);
            if (!this.elements[i].optional)
                ret[0] += s[0];
            ret[1] += s[1];
            if (s[2])
                prevCharMightBeSpace = true;
            else if (!this.elements[i].optional)
                prevCharMightBeSpace = false;
        }
        ret[2] = prevCharMightBeSpace;
        return ret;
    }
}

export class AlternativeParseElement implements ParseElement {
    readonly elements: ParseElement[];

    constructor(elements: ParseElement[]) {
        this.elements = elements;
    }

    parse(context: ParseContext, userContext: any): boolean {
        for (let i = 0; i < this.elements.length; i++) {
            let clone = new ParseContext(context.text);
            clone.offset = context.offset;
            let success = this.elements[i].parse(clone, userContext);
            context.problems.push(...clone.problems);
            if (success) {
                context.offset = clone.offset;
                Object.assign(context.valueMap, clone.valueMap);
                return true;
            }
        }
        return false;
    }

    getExpectedNumberOfSpaces(prevCharMightBeSpace: boolean): [number, number, boolean] {
        let ret: [number, number, boolean] = [0, 0, false];
        for (let i = 0; i < this.elements.length; i++) {
            let s = this.elements[i].getExpectedNumberOfSpaces(prevCharMightBeSpace);
            ret[0] = Math.min(ret[0], s[0]);
            ret[1] = Math.max(ret[1], s[1]);
            if (ret[2])
                ret[2] = true;
        }
        return ret;
    }
}

export class ExactTextParseElement implements ParseElement {
    text: string;

    constructor(text: string) {
        this.text = text;
    }

    parse(context: ParseContext): boolean {
        if (context.text.length < context.offset + this.text.length)
            return context.createError(this);
        if (context.text.substr(context.offset, this.text.length) != this.text)
            return context.createError(this);
        context.offset += this.text.length;
        return true;
    }

    getExpectedNumberOfSpaces(prevCharMightBeSpace: boolean): [number, number, boolean] {
        let cnt = 0;
        for (const c of this.text)
            if (c === ' ')
                ++cnt;
        return [cnt, cnt, this.text.endsWith(" ")];
    }
}