const listLine = /^\s*([-*•]|\d+[.)])\s+(.+)$/u;
const flightLine = /^([^|\n]+) \| ([A-Z]{3} .+?) → ([A-Z]{3} .+?) \| (\$[\d,.]+ total)$/u;

function FlightDetails({ flight }: { flight: RegExpMatchArray }) {
  const [, name, departure, arrival, fare] = flight;
  return <span className="flight-details">
    <span className="flight-details-heading">
      <strong className="reply-item-name">{name}</strong>
      <strong className="flight-fare">{fare}</strong>
    </span>
    <span className="flight-legs">
      <span><span className="flight-leg-label">Departs</span>{departure}</span>
      <span><span className="flight-leg-label">Arrives</span>{arrival}</span>
    </span>
  </span>;
}

function ListItemText({ text }: { text: string }) {
  const flight = text.match(flightLine);
  if (flight) return <FlightDetails flight={flight} />;

  // A rate line starts with a property or package name followed by the first stay and price.
  const rateStart = text.search(/ — (?=[^—;:]+: \$)/u);
  if (rateStart === -1) return <span>{text}</span>;

  const name = text.slice(0, rateStart);
  const [rates, ...terms] = text.slice(rateStart + 3).split(' | ');
  return <span>
    <strong className="reply-item-name">{name}</strong>
    <span className="reply-item-details">{rates}</span>
    {terms.length > 0 && <span className="reply-item-details">{terms.join(' | ')}</span>}
  </span>;
}

export function ReplyText({ text }: { text: string }) {
  return <span className="reply-copy">
    {text.trim().split(/\r?\n(?:[ \t]*\r?\n)+/).map((paragraph, index) => {
      const lines = paragraph.split(/\r?\n/);
      const items = lines.flatMap(line => {
        const match = line.match(listLine);
        return match ? [{ marker: match[1], text: match[2] }] : [];
      });
      if (items.length !== lines.length) {
        const flight = paragraph.match(flightLine);
        if (flight) return <span className="reply-flight-summary" key={index}><FlightDetails flight={flight} /></span>;
        return <span className="reply-paragraph" key={index}>{paragraph}</span>;
      }
      return <span className="reply-list" role="list" key={index}>
        {items.map((item, itemIndex) => <span className="reply-list-item" role="listitem" key={itemIndex}>
          <span className="reply-list-marker" aria-hidden="true">{/^\d/.test(item.marker) ? item.marker : '•'}</span>
          <ListItemText text={item.text} />
        </span>)}
      </span>;
    })}
  </span>;
}
