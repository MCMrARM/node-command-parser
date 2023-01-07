import {isWhitespace, ParseContext} from "./parse_context.js";
import {ParseElement} from "./parse_element.js";

export abstract class ArgType<T, UserContext = {}> implements ParseElement {
    readonly key: string;
    readonly optional: boolean;
    typingCanBeOptional?: boolean;

    constructor(key: string, optional: boolean) {
        this.key = key;
        this.optional = optional;
    }

    abstract parse(context: ParseContext, userContext: UserContext): boolean;

    getExpectedNumberOfSpaces(prevCharMightBeSpace: boolean): [number, number, boolean] {
        return [0, 0, false];
    }

    set(context: ParseContext, value: T) {
        context.valueMap[this.key] = value;
    }
}

export type ArgTypeConstructor = new (key: string, optional: boolean) => ArgType<any, any>;

export abstract class BaseWordArgType<T> extends ArgType<T> {
    parse(context: ParseContext): boolean {
        let offset = context.offset;
        let word = context.nextWord();
        if (!word || !this.parseWord(context, word))
            return context.createError(this, offset);
        return true;
    }
    abstract parseWord(context: ParseContext, word: string): boolean;
}

export class WordArgType extends BaseWordArgType<string> {
    parseWord(context: ParseContext, word: string): boolean {
        this.set(context, word);
        return true;
    }
}

export class NumberArgType extends ArgType<number> {
    parse(context: ParseContext): boolean {
        let offset = context.offset;
        let word = context.nextWord();
        let num: number|undefined = word && !isNaN(+word) && !isNaN(parseFloat(word)) ? parseFloat(word) : undefined;
        if (num === undefined)
            return context.createError(this, offset);
        this.set(context, num);
        return true;
    }
}

const digits = "0123456789";
export class NaturalNumberArgType extends ArgType<number> {
    parse(context: ParseContext): boolean {
        let offset = context.offset;
        let word = context.nextWithPredicate((x) => digits.indexOf(x) !== -1);
        let num: number|undefined = word ? parseInt(word) : undefined;
        if (num === undefined)
            return context.createError(this, offset);
        this.set(context, num);
        return true;
    }
}

const timeUnitMapSrc: [string[], number][] = [
    [["s", "S", "sec", "second", "seconds"], 1000],
    [["m", "min", "mins", "minute", "minutes"], 60 * 1000],
    [["h", "H", "hour", "hours"], 60 * 60 * 1000],
    [["d", "D", "day", "days"], 24 * 60 * 60 * 1000],
    [["w", "W", "week", "weeks"], 7 * 24 * 60 * 60 * 1000],
    [["M", "month", "months"], 30 * 24 * 60 * 60 * 1000],
    [["y", "Y", "year", "years"], 365 * 24 * 60 * 60 * 1000],
];
const timeUnitMap: {[key: string]: number} = {};
for (let [kSet, v] of timeUnitMapSrc)
    for (let k of kSet)
        timeUnitMap[k] = v;
interface TimeDurationArgTypeOptions {
    defaultUnit: string
}
export class TimeDurationArgType extends ArgType<number> {

    opts!: TimeDurationArgTypeOptions;

    static withOptions(opts: TimeDurationArgTypeOptions): ArgTypeConstructor {
        class ret extends TimeDurationArgType {}
        ret.prototype.opts = opts;
        return ret;
    }

    parse(context: ParseContext): boolean {
        let offset = context.offset;
        let word = context.nextWithPredicate((x) => digits.indexOf(x) !== -1 || x == ".");
        let num: number|undefined = word ? parseFloat(word) : undefined;
        if (num === undefined)
            return context.createError(this, offset);
        context.eatWhitespace();
        let secondOffset = context.offset;
        word = context.nextWord();
        if (!word || !(word in timeUnitMap)) {
            word = this.opts?.defaultUnit;
            if (!word || !(word in timeUnitMap))
                return context.createError(this, offset, context.offset - offset);
            context.offset = secondOffset;
        }
        this.set(context, num * timeUnitMap[word]);
        return true;
    }

    getExpectedNumberOfSpaces(prevCharMightBeSpace: boolean): [number, number, boolean] {
        return [0, 1, false];
    }
}

export class LongTextArgType extends ArgType<string, any> {
    child?: ParseElement;
    private _childMinSpaces: number = 0;
    private _childMaxSpaces: number = 0;

    updateChildContent() {
        if (!this.child)
            return;
        let s = this.child.getExpectedNumberOfSpaces(true);
        this._childMinSpaces = s[0];
        this._childMaxSpaces = s[1];
    }

    parse(context: ParseContext, userContext: any): boolean {
        if (context.eof || isWhitespace(context.atChar)) {
            context.createError(this);
            if (this.optional)
                return this.child?.parse(context, userContext) || false;
            return false;
        }
        let i = context.text.length;
        for (let j = 0; j < this._childMinSpaces && i > context.offset; j++)
            i = context.text.lastIndexOf(" ", i - 1);
        let j;
        for (j = this._childMinSpaces; j <= this._childMaxSpaces && i > context.offset; j++) {
            let clone = new ParseContext(context.text);
            clone.offset = i;
            let success = this.child!.parse(clone, userContext);
            context.problems.push(...clone.problems);
            if (success) {
                this.set(context, context.text.substr(context.offset, i - context.offset));
                context.offset = clone.offset;
                Object.assign(context.valueMap, clone.valueMap);
                return true;
            }

            i = context.text.lastIndexOf(" ", i - 1);
        }
        context.createError(this);
        if (j <= this._childMaxSpaces && this.optional)
            return this.child?.parse(context, userContext) || false;
        return false;
    }

    getExpectedNumberOfSpaces(prevCharMightBeSpace: boolean): [number, number, boolean] {
        throw Error("getExpectedNumberOfSpaces is unsupported on LongTextArgType, LongTextArgType elements can only occur once");
    }
}

export function makeOptional<K, C>(arg: new (key: string, optional: boolean) => ArgType<K, C>): new (key: string, optional: boolean) => ArgType<K | undefined, C>;
export function makeOptional<K, C>(arg: new (key: string, optional: boolean) => ArgType<K, C>, defaultValue: K): new (key: string, optional: boolean) => ArgType<K, C>;

export function makeOptional<K, C>(arg: new (key: string, optional: boolean) => ArgType<K, C>, defaultValue?: K): any {
    // @ts-ignore
    class ret extends arg {}
    ret.prototype.typingCanBeOptional = true;
    if (defaultValue !== undefined) {
        let p = ret.prototype.parse;
        ret.prototype.parse = function (context: ParseContext, userContext: any): boolean {
            this.set(context, defaultValue);
            return p.call(this, context, userContext);
        };
    }
    return ret;
}

export const defaultArgTypes: {[type: string]: ArgTypeConstructor} = {
    word: WordArgType,
    number: NumberArgType,
    natural: NaturalNumberArgType,
    time: TimeDurationArgType,
    "text...": LongTextArgType
};