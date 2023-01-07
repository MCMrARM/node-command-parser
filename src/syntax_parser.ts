import {ArgType, defaultArgTypes, LongTextArgType} from "./arg_type.js";
import {
    ParseElement,
    AlternativeParseElement,
    ContainerParseElement,
    ExactTextParseElement,
    WhitespaceParseElement, EndParseElement
} from "./parse_element.js";

export type ParseOptionsInternal = {
    argNameToType?: { [key: string]: new (key: string, optional: boolean) => ArgType<any> },
    nested?: boolean
};

export function parseSyntaxInternal(syntax: string, opts: ParseOptionsInternal): [number, ParseElement] {
    let args: ParseElement[] = [];
    let lastArg: any = null;
    let push = (x: ParseElement) => {
        args.push(x);
        lastArg = x;
    };
    let i: number;
    for (i = 0; i < syntax.length;) {
        let c = syntax.charAt(i++);
        if (c === ' ') {
            if (lastArg !== WhitespaceParseElement.instance)
                push(WhitespaceParseElement.instance);
        } else if (c === '\\' && i + 1 < syntax.length) {
            if (lastArg instanceof ExactTextParseElement)
                lastArg.text += syntax.charAt(i++);
            else
                push(new ExactTextParseElement(syntax.charAt(i++)));
        } else if (c == '<' || c == '[') {
            let optional = (c == '[');
            let endTag = (c == '[' ? ']' : '>');
            let startIof = i;
            for (; ; i++) {
                c = syntax.charAt(i);
                if (c == endTag || c == ':')
                    break;
            }
            let argName = syntax.substring(startIof, i - startIof).trim();
            let argType;
            if (opts.argNameToType) {
                if (c == ':')
                    throw Error("Arguments may not have a separately defined type when using typed arguments");
                if (!(argName in opts.argNameToType))
                    throw Error("Argument " + argName + " not defined in the argument list object");
                argType = opts.argNameToType[argName];
            } else {
                ++i;
                if (c != ':')
                    throw Error("All arguments must have a defined type when using typed arguments");
                startIof = ++i;
                for (; ; i++) {
                    c = syntax.charAt(i);
                    if (c == endTag)
                        break;
                }
                argType = syntax.substr(startIof, i - startIof).trim();
                if (!(argType in defaultArgTypes))
                    throw Error("Unknown argument type: " + argType);
                argType = defaultArgTypes[argType];
            }
            if (optional && argType.prototype.typingCanBeOptional !== true)
                throw Error("When using typed arguments, optional arguments must be explicitly made optional with makeOptional");
            let argTypeI = new argType(argName, optional);
            push(argTypeI);
            if (argTypeI instanceof LongTextArgType) {
                if (opts.nested)
                    throw new Error("LongTextArgType may not occur in brackets");
                argTypeI.child = parseSyntaxInternal(syntax.substr(i + 1), opts)[1];
                argTypeI.updateChildContent();
                break;
            }
            ++i;
        } else if (c == '(') {
            let list = [];
            let nestedOpts = {...opts, nested: true};
            while (i < syntax.length) {
                let [j, nested] = parseSyntaxInternal(syntax.substr(i), nestedOpts);
                list.push(nested);
                if (i + j >= syntax.length)
                    throw Error("Unexpected end of text when parsing nested expression");
                c = syntax.charAt(i + j);
                i = i + j + 1;
                if (c != '|')
                    break;
            }
            if (c != ')')
                throw Error("Unexpected termination of nested expression");
            if (list.length > 1)
                push(new AlternativeParseElement(list));
            else if (list.length === 1)
                push(list[0]);
        } else if (opts.nested && (c == '|' || c == ')')) {
            --i;
            break;
        } else {
            if (lastArg instanceof ExactTextParseElement)
                lastArg.text += c;
            else
                push(new ExactTextParseElement(c));
        }
    }
    if (!opts.nested)
        push(EndParseElement.instance);
    return [i, new ContainerParseElement(args)];
}