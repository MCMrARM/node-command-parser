import {ParseProblem} from "./error.js";
import {ParseElement} from "./parse_element.js";

export function isWhitespace(char: string) {
    return char === " ";
}

export class ParseContext {

    text: string;
    offset: number = 0;
    valueMap: {[key: string]: any} = {};
    problems: ParseProblem[] = [];

    constructor(text: string) {
        this.text = text;
    }

    get eof() {
        return this.offset === this.text.length;
    }

    get atChar() {
        return this.text.charAt(this.offset);
    }

    eatWhitespace(): boolean {
        if (!this.eof && !isWhitespace(this.atChar))
            return false;
        while (!this.eof && isWhitespace(this.atChar))
            ++this.offset;
        return true;
    }

    nextWithPredicate(predicate: (c: string) => boolean): string|undefined {
        if (this.eof || !predicate(this.atChar))
            return undefined;
        let end;
        for (end = this.offset; end < this.text.length; end++) {
            if (!predicate(this.text.charAt(end)))
                break;
        }
        let ret = this.text.substr(this.offset, end - this.offset);
        this.offset = end;
        return ret;
    }

    nextWord() {
        return this.nextWithPredicate((c) => !isWhitespace(c));
    }

    createError(element: ParseElement, offset?: number, length?: number): boolean {
        let savedOffset = this.offset;
        offset = offset !== undefined ? offset : this.offset;
        if (length === undefined) {
            this.offset = offset;
            length = this.nextWord()?.length || 0;
            this.offset = savedOffset;
        }
        this.problems.push({
            start: offset,
            length: length,
            element: element
        });
        return false;
    }

}