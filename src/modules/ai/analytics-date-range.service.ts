import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AnalyticsComparison,
  AnalyticsDateRange,
  AnalyticsPeriodPreset,
} from './domain/analytics-copilot.types';
import { AnalyticsCopilotQueryDto } from './dto/analytics-copilot.dto';

@Injectable()
export class AnalyticsDateRangeService {
  resolve(dto: AnalyticsCopilotQueryDto, now = new Date()) {
    this.assertTimezone(dto.timezone);
    const today = this.formatDateInTimezone(now, dto.timezone);
    let fromDate: string;
    let toDate: string;
    if (dto.period === AnalyticsPeriodPreset.CUSTOM) {
      if (!dto.fromDate || !dto.toDate)
        throw new BadRequestException(
          'fromDate and toDate are required for a custom period',
        );
      fromDate = dto.fromDate;
      toDate = dto.toDate;
    } else {
      const days = dto.period === AnalyticsPeriodPreset.LAST_7_DAYS ? 7 : 30;
      toDate = today;
      fromDate = this.addCalendarDays(today, -(days - 1));
    }
    const current = this.buildRange(fromDate, toDate, dto.timezone);
    const comparison =
      dto.comparison === AnalyticsComparison.PREVIOUS_PERIOD
        ? this.buildRange(
            this.addCalendarDays(fromDate, -current.dayCount),
            this.addCalendarDays(fromDate, -1),
            dto.timezone,
          )
        : null;
    return { current, comparison };
  }

  private buildRange(
    fromDate: string,
    toDate: string,
    timezone: string,
  ): AnalyticsDateRange {
    const startDay = this.parseCalendarDate(fromDate);
    const endDay = this.parseCalendarDate(toDate);
    const dayCount = Math.round((endDay - startDay) / 86_400_000) + 1;
    if (dayCount < 1)
      throw new BadRequestException('fromDate must be on or before toDate');
    if (dayCount > 366)
      throw new BadRequestException('Analytics periods cannot exceed 366 days');
    return {
      fromDate,
      toDate,
      startUtc: this.zonedMidnightToUtc(fromDate, timezone),
      endExclusiveUtc: this.zonedMidnightToUtc(
        this.addCalendarDays(toDate, 1),
        timezone,
      ),
      dayCount,
    };
  }

  private assertTimezone(timezone: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(
        new Date(),
      );
    } catch {
      throw new BadRequestException('timezone must be a valid IANA timezone');
    }
  }

  private formatDateInTimezone(value: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';
    return [read('year'), read('month'), read('day')].join('-');
  }

  private zonedMidnightToUtc(date: string, timezone: string) {
    const [year, month, day] = date.split('-').map(Number);
    const desired = Date.UTC(year, month - 1, day);
    let guess = desired;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const parts = formatter.formatToParts(new Date(guess));
      const read = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((part) => part.type === type)?.value ?? 0);
      const represented = Date.UTC(
        read('year'),
        read('month') - 1,
        read('day'),
        read('hour'),
        read('minute'),
        read('second'),
      );
      guess += desired - represented;
    }
    return new Date(guess);
  }

  private parseCalendarDate(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = Date.UTC(year, month - 1, day);
    if (new Date(parsed).toISOString().slice(0, 10) !== value)
      throw new BadRequestException('Invalid calendar date');
    return parsed;
  }

  private addCalendarDays(value: string, days: number) {
    return new Date(this.parseCalendarDate(value) + days * 86_400_000)
      .toISOString()
      .slice(0, 10);
  }
}
