// Splits the `args` input into an argv array.
//
// This is argStringToArray from @actions/exec (MIT, Copyright 2019 GitHub),
// copied because @actions/exec 3.x no longer exports it. Same rules on every
// OS: split on spaces, double quotes group, backslash escapes a double quote
// inside quotes. Newlines and tabs are treated as spaces first, so a YAML
// block scalar can put one flag per line.
export function argStringToArray(input) {
  const argString = String(input ?? '').replace(/[\r\n\t]+/g, ' ');
  const args = [];
  let inQuotes = false;
  let escaped = false;
  let arg = '';
  function append(c) {
    // we only escape double quotes.
    if (escaped && c !== '"') {
      arg += '\\';
    }
    arg += c;
    escaped = false;
  }
  for (let i = 0; i < argString.length; i++) {
    const c = argString.charAt(i);
    if (c === '"') {
      if (!escaped) {
        inQuotes = !inQuotes;
      } else {
        append(c);
      }
      continue;
    }
    if (c === '\\' && escaped) {
      append(c);
      continue;
    }
    if (c === '\\' && inQuotes) {
      escaped = true;
      continue;
    }
    if (c === ' ' && !inQuotes) {
      if (arg.length > 0) {
        args.push(arg);
        arg = '';
      }
      continue;
    }
    append(c);
  }
  if (arg.length > 0) {
    args.push(arg.trim());
  }
  return args;
}

