import { describe, it, expect } from "vitest";
import { parseCommitteeScheduleXml, parseFloorScheduleXml } from "./senate-schedule";

describe("parseFloorScheduleXml", () => {
  it("parses floor schedule items with fallbacks", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <floor_schedule>
        <item>
          <title>Morning Business</title>
          <date>2026-01-04</date>
          <time>10:00 AM</time>
          <description>Executive nominations</description>
          <location>Senate Chamber</location>
          <url>https://example.com/floor</url>
        </item>
        <item>
          <title>Evening Session</title>
        </item>
      </floor_schedule>`;

    const result = parseFloorScheduleXml(xml, "2026-01-04");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(
      expect.objectContaining({
        date: "2026-01-04",
        time: "10:00 AM",
        title: "Morning Business",
        summary: "Executive nominations",
        location: "Senate Chamber",
        url: "https://example.com/floor",
      })
    );
    expect(result[1].date).toBe("2026-01-04");
  });

  it("parses legislative day convenings format", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <CongressSessionDayConvenings Congress="119" FileType="SessionDays" SessionNumber="2">
        <LegislativeDay LegislativeDayDate="2026-01-05T00:00:00-05:00">
          <SessionDay>
            <ConveneDate>2026-01-05T15:00:00-05:00</ConveneDate>
            <AdjournDate>2026-01-05T18:13:00-05:00</AdjournDate>
            <AdjournType>Adjourn</AdjournType>
            <NextConveneDate>2026-01-06T10:00:00-05:00</NextConveneDate>
          </SessionDay>
        </LegislativeDay>
      </CongressSessionDayConvenings>`;

    const result = parseFloorScheduleXml(xml, "2026-01-05");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(
      expect.objectContaining({
        date: "2026-01-05",
        time: "3:00 PM",
        title: "Senate convenes",
      })
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        date: "2026-01-06",
        time: "10:00 AM",
        title: "Next convene",
      })
    );
  });

  it("returns empty list for malformed XML", () => {
    const result = parseFloorScheduleXml("<floor_schedule><item>", "2026-01-04");
    expect(result).toEqual([]);
  });
});

describe("parseCommitteeScheduleXml", () => {
  it("parses committee meetings with core fields", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <committee_schedule>
        <meeting>
          <committee_name>Judiciary</committee_name>
          <meeting_date>2026-01-04</meeting_date>
          <meeting_time>02:00 PM</meeting_time>
          <title>Oversight hearing</title>
          <location>SD-226</location>
        </meeting>
        <meeting>
          <committee_name>Finance</committee_name>
          <title>Markup session</title>
        </meeting>
      </committee_schedule>`;

    const result = parseCommitteeScheduleXml(xml, "2026-01-04");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(
      expect.objectContaining({
        committee: "Judiciary",
        date: "2026-01-04",
        time: "02:00 PM",
        title: "Oversight hearing",
        location: "SD-226",
      })
    );
    expect(result[1].committee).toBe("Finance");
    expect(result[1].date).toBe("2026-01-04");
  });

  it("parses official hearings XML format", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <css_meetings_scheduled>
        <meeting>
          <committee>Judiciary</committee>
          <sub_cmte>Federal Courts</sub_cmte>
          <date_iso_8601>2026-01-28</date_iso_8601>
          <time>02:30 PM</time>
          <room>SD-226</room>
          <matter>Oversight hearing</matter>
        </meeting>
      </css_meetings_scheduled>`;

    const result = parseCommitteeScheduleXml(xml, "2026-01-04");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        committee: "Judiciary",
        subcommittee: "Federal Courts",
        date: "2026-01-28",
        time: "02:30 PM",
        title: "Oversight hearing",
        location: "SD-226",
      })
    );
  });

  it("returns empty list for malformed XML", () => {
    const result = parseCommitteeScheduleXml("<committee_schedule><meeting>", "2026-01-04");
    expect(result).toEqual([]);
  });
});
