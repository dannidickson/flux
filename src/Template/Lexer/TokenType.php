<?php

namespace Flux\Template\Lexer;

/**
 * Token kinds produced by the {@see Lexer}. Operators are lexed even though analysis never
 * evaluates conditions, so real templates containing them don't break the parse.
 */
enum TokenType: string
{

    case Text = 'TEXT'; // literal HTML run
    case TagOpen = 'TAG_OPEN'; // <%
    case TagClose = 'TAG_CLOSE'; // %>
    case Comment = 'COMMENT'; // <%-- ... --%> (inner text, trimmed)
    case Dollar = 'DOLLAR'; // $ sigil beginning a variable
    case LBrace = 'LBRACE'; // { opening a {$ ... } interpolation
    case RBrace = 'RBRACE'; // }
    case Name = 'NAME'; // identifier
    case Dot = 'DOT'; // .
    case LParen = 'LPAREN'; // (
    case RParen = 'RPAREN'; // )
    case Comma = 'COMMA'; // ,
    case Equals = 'EQUALS'; // = (include argument assignment)
    case Str = 'STR'; // quoted string literal (unquoted value)
    case Number = 'NUMBER'; // numeric literal
    case Eq = 'EQ'; // ==
    case Neq = 'NEQ'; // !=
    case Lt = 'LT'; // <
    case Gt = 'GT'; // >
    case Lte = 'LTE'; // <=
    case Gte = 'GTE'; // >=
    case And = 'AND'; // &&
    case Or = 'OR'; // ||
    case Not = 'NOT'; // !
    case Eof = 'EOF';

}
