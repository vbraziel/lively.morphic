import { string, arr } from "lively.lang";
import { lessPosition, lessEqPosition, eqPosition, maxPosition, minPosition } from "./position.js";
import { Range } from "./range.js";
import { StyleRange } from "./style.js";

const newline = "\n",
      newlineLength = newline.length;

export default class TextDocument {

  static fromString(string) {
    var doc = new TextDocument();
    doc.textString = string;
    return doc;
  }

  static get newline() { return newline; }
  static get newlineLength() { return newlineLength; }
  static parseIntoLines(text) { return text.split(this.newline); }

  constructor(lines = [], styleRanges = []) {
    this.lines = lines;
    this._styleRanges = [];
    this._styleRangesByLine = [];
    styleRanges.map(range => this.addStyleRange(range));
  }

  get textString() { return this.lines.join(TextDocument.newline); }
  set textString(string) { this.lines = TextDocument.parseIntoLines(string); }
  get stringLength() { return this.textString.length; }

  get endPosition() {
    var lines = this.lines, length = lines.length;
    return length ? {
      row: lines.length-1,
      column: lines[lines.length-1].length
    } : {row: 0, column: 0}
  }

  get styleRanges() { return this._styleRanges }

  set styleRanges(styleRanges) {
    this._styleRanges = styleRanges;
    for (let row = 0; row < this.lines.length; row++) {
      this.updateLineStyleRanges(row);
    }
  }

  addStyleRange(range) {
    this._styleRanges = StyleRange.mergeInto(this._styleRanges, range);
    for (let row = range.start.row; row <= range.end.row; row++) {
      this.updateLineStyleRanges(row);
    }
    // TODO: Consolidate/deduplicate ranges
  }

  clearStyleRanges() { this._styleRanges = []; }

  updateLineStyleRanges(row) {
    let { styleRanges } = this,
        text = this.getLine(row),
        start = { row, column: 0 },
        end = { row, column: text ? text.length : 0 },
        lineRange = Range.fromPositions(start, end),
        lineStyleRanges = [];
    styleRanges.forEach(ea => {
      let { style, range } = ea,
          intersection = lineRange.intersect(range);
      if (intersection.start.row === lineRange.start.row)
        lineStyleRanges.push(new StyleRange(style, intersection));
    });
    this._styleRangesByLine[row] = Range.sort(lineStyleRanges);
  }

  get styleRangesByLine() { return this._styleRangesByLine; }

  getLine(row) {
    var safeRow = Math.min(Math.max(0, row), this.lines.length-1);
    return this.lines[safeRow];
  }

  positionToIndex(pos, startRow = 0) {
    let {row, column} = this.clipPositionToLines(pos),
        index = 0,
        lines = this.lines,
        maxLength = lines.length-1;
    for (var i = startRow; i < row; i++)
      index += lines[i].length + (i === maxLength ? 0 : TextDocument.newlineLength);
    return index + column;
  }

  indexToPosition(index, startRow = 0) {
    // TextDocument.fromString("hello\nworld").indexToPosition(8)
    if (index < 0) index = 0;
    var lines = this.lines;
    if (lines.length === 0) return {row: 0, column: 0};
    for (var i = startRow, l = lines.length; i < l; i++) {
      index -= lines[i].length + TextDocument.newlineLength;
      if (index < 0)
        return {row: i, column: index + lines[i].length + TextDocument.newlineLength};
    }
    return {row: l-1, column: lines[l-1].length};
  }

  clipPositionToLines({row, column}) {
    let lines = this.lines,
        nLines = lines.length;

    if (nLines === 0) return {row: 0, column: 0};

    if (row < 0) row = 0;
    else if (row >= nLines) row = nLines-1;

    if (column < 0) column = 0;
    else if (column > lines[row].length) column = lines[row].length;

    return {row, column}
  }

  textInRange({start, end}) {
    start = this.clipPositionToLines(start);
    end = this.clipPositionToLines(end);
    if (lessPosition(end, start)) [start, end] = [end, start];

    let {row, column} = start,
        {row: endRow, column: endColumn} = end,
        lines = this.lines;

    if (row === endRow)
      return column === endColumn ?
        "" : lines[row].slice(column, endColumn);

    let result = lines[row].slice(column);
    for (let i = row+1; i < endRow; i++)
      result += TextDocument.newline + lines[i];
    return result + TextDocument.newline + lines[endRow].slice(0, endColumn);
  }

  setTextInRange(string, range) {
    var {start, end} = range;
    this.remove(range);
    return this.insert(string, start);
  }

  insert(string, pos) {
    let {lines, styleRanges} = this,
        {row, column} = pos,
        line = lines[row],
        insertionLines = TextDocument.parseIntoLines(string);

    if (!line) line = lines[row] = "";

    if (column > line.length)
        line += " ".repeat(column - line.length);

    let end = {row, column},
        before = line.slice(0, column),
        after = line.slice(column),
        firstLine = insertionLines.shift() || "";

    end.column += firstLine.length;
    lines[row] = before + firstLine;

    for (var i = 0; i < insertionLines.length; i++) {
      end.row++;
      end.column = insertionLines[i].length;
      lines.splice(row+1+i, 0, insertionLines[i]);
      this._styleRangesByLine.splice(row+1+i, 0, []);
    }

    lines[row + insertionLines.length] = lines[row + insertionLines.length] + after;

    let insertionRange = {start: pos, end};
    styleRanges.forEach(ea => ea.onInsert(insertionRange));
    for (let row = pos.row; row <= end.row; row++) {
      this.updateLineStyleRanges(row);
    }
    return insertionRange;
  }

  remove({start, end}) {
    var {lines, styleRanges} = this;
    if (!lines.length) return;

    if (lessPosition(end, start)) [start, end] = [end, start];

    let {row: fromRow, column: fromCol} = maxPosition(start, {column: 0, row: 0}),
        {row: toRow, column: toCol} = minPosition(end, this.endPosition);

    if (fromCol < 0) fromCol = 0;
    if (toCol < 0) toCol = 0;

    lines[fromRow] = lines[fromRow].slice(0, fromCol) + lines[toRow].slice(toCol);
    lines.splice(fromRow+1, toRow - fromRow);
    this._styleRangesByLine.splice(fromRow+1, toRow - fromRow);

    styleRanges.forEach(ea => ea.onDelete({start, end}));
    this._styleRanges = styleRanges.filter(ea => !ea.isEmpty());
    this.updateLineStyleRanges(fromRow);
  }

  wordsOfLine(row) {
    var line = this.lines[row] || "",
        words = [], word,
        isWordDelimiter = char => /[^a-z0-9_]/i.test(char);

    for (var i = 0; i < line.length; i++) {
      if (isWordDelimiter(line[i])) {
        if (word) {
          word.range.end.column = i;
          words.push(word);
          word = null;
        }
      } else {
        word = (word || {index: words.length, string: "", range: {start: {row, column: i}, end: {row, column: i}}});
        word.string += line[i];
      }
    }
    if (word) { word.range.end.column = i; words.push(word); }
    return words;
  }

  wordAt({row, column}, words = this.wordsOfLine(row)) {
    return words.find(ea => {
      var {range: {start: {column: startCol}, end: {column: endCol}}} = ea;
      return startCol <= column && column <= endCol;
    }) || {range: {start: {column, row}, end: {column, row}}, string: ""};
  }

  wordLeft(pos) {
    var {row, column} = pos,
        words = this.wordsOfLine(row);

    // nothing on this line, find previous word of a line above
    if (!words.length || lessEqPosition(pos, words[0].range.start)) {
      while (--row >= 0) {
        words = this.wordsOfLine(row);
        if (words.length) return arr.last(words);
      }
      return {range: {start: pos, end: pos}, string: ""};
    }

    var word = this.wordAt(pos);
    // if there is a word at pos and pos = beginning of word we return the word
    // to the left, otherwise word
    if (word.string)
      return eqPosition(word.range.start, pos) ? words[word.index-1] : word;

    // no word at pos, find the next left word next to pos
    return words.slice().reverse().find(word => word.range.end.column <= column) || {range: {start: pos, end: pos}, string: ""};
  }

  wordRight(pos) {
    var {column, row} = pos,
        words = this.wordsOfLine(pos.row);
    if (!words.length || lessEqPosition(arr.last(words).range.end, pos)) {
      while (++row < this.lines.length) {
        words = this.wordsOfLine(row);
        if (words.length) return words[0];
      }
      return {range: {start: pos, end: pos}, string: ""};
    }
    var word = this.wordAt(pos);
    if (word.string) {
      return eqPosition(word.range.end, pos) ? words[word.index+1] : word;
    }
    return words.find(word => word.range.start.column >= column) || {range: {start: pos, end: pos}, string: ""};
  }


  scanForward(startPos, matchFn) {
    var {
          endPosition: {row: endRow, column: endColumn},
          lines
        } = this,
        {row, column} = startPos

    // first line
    for (let col = column, line = lines[row]; col < line.length; col++) {
      let char = line[col], pos = {row, column: col},
          result = matchFn(char, pos);
      if (result) return result;
    }

    // the rest
    for (let r = row+1; r < lines.length; r++) {
      let line = lines[r];
      for (let col = 0; col < line.length; col++) {
        let char = line[col], pos = {row: r, column: col},
            result = matchFn(char, pos);
        if (result) return result;
      }
    }

    return null;
  }

  scanBackward(startPos, matchFn) {
    var lines = this.lines,
        {row, column} = startPos

    // first line
    for (let col = column-1, line = lines[row]; col >= 0; col--) {
      let char = line[col], pos = {row, column: col},
          result = matchFn(char, pos);
      if (result) return result;
    }

    // the rest
    for (let r = row-1; r >= 0; r--) {
      let line = lines[r];
      for (let col = line.length-1; col >= 0; col--) {
        let char = line[col], pos = {row: r, column: col},
            result = matchFn(char, pos);
        if (result) return result;
      }
    }

    return null;
  }

  copy() { return new TextDocument(this.lines.slice()); }

  toString() { return `TextDocument(${string.truncate(this.textString, 60)})`; }
}
