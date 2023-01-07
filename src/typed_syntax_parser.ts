import {parseSyntaxInternal} from "./syntax_parser.js";
import {ArgType} from "./arg_type.js";
import {ParseElement} from "./parse_element.js";
import {ParseContext} from "./parse_context.js";
import {ParseError} from "./error.js";

// https://stackoverflow.com/questions/50374908/transform-union-type-to-intersection-type/50375286#50375286
type UnionToIntersection<U> = (U extends any ? (k: U)=>void : never) extends ((k: infer I)=>void) ? I : never;

type TypedOverloadInfo = [string, {
    [key: string]: new (key: string, optional: boolean) => ArgType<any, any>
}];
type extractArgType<Type> = Type extends new (key: string, optional: boolean) => ArgType<infer T> ? T : never;
type extractUserContextType<Type> = Type extends new (key: string, optional: boolean) => ArgType<any, infer T> ? T extends {} ? T : {} : {};
type TypedParserFunction<T extends { [tag: string]: TypedOverloadInfo }, UserContext> = (text: string, userContext: UserContext) => {
    [K in keyof T]: {
        overload: K
    } & {
        [P in keyof T[K][1]]: extractArgType<T[K][1][P]>
    }
}[keyof T]
type OverloadUserContextTypeUnion<T extends TypedOverloadInfo> = {
    [K in keyof T[1]]: extractUserContextType<T[1][K]>
}[keyof T[1]]
type UserContextTypeUnion<T extends { [tag: string]: TypedOverloadInfo }> = {
    [K in keyof T]: OverloadUserContextTypeUnion<T[K]>
}[keyof T]
type UserContextTypes<T extends { [tag: string]: TypedOverloadInfo }> = UnionToIntersection<UserContextTypeUnion<T>>;

export function parseTypedSyntax<T extends { [tag: string]: TypedOverloadInfo }>(map: T): TypedParserFunction<T, UserContextTypes<T>> {
    let options: [string, ParseElement][] = Object.entries(map).map(x => {
        let [syntaxDef, argTypes] = x[1];
        let parsed = parseSyntaxInternal(syntaxDef, {argNameToType: argTypes})[1];
        return [x[0], parsed];
    });
    return ((text: string, userContext: UserContextTypes<T>) => {
        let problems = [];
        for (let opt of options) {
            let context = new ParseContext(text);
            if (opt[1].parse(context, userContext))
                return {...context.valueMap, overload: opt[0]};
            problems.push(...context.problems);
        }
        throw new ParseError(text, problems);
    }) as any;
}
