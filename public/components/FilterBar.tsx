import { EuiButton, EuiDatePicker, EuiDatePickerRange, EuiFlexGroup, EuiFlexItem, EuiPanel, EuiText } from "@elastic/eui";
import { Moment } from "moment";
import React from "react"

interface Props {
    startDate: Moment;
    endDate: Moment;
    onStartDateChange: (date: Moment) => void;
    onEndDateChange: (date: Moment) => void;
    onFilter: () => void;
}
export const FilterBar = ({
    endDate,
    onEndDateChange,
    onFilter,
    onStartDateChange,
    startDate
}: Props) => {
    return (
        <EuiPanel color="subdued" style={{ backgroundColor: '#2b34c7' }}>
            <EuiFlexGroup alignItems="center">
                <EuiFlexItem grow={false}>
                    <EuiText color="ghost"><strong>Filter by Date and Time</strong></EuiText>
                </EuiFlexItem>
                <EuiDatePickerRange
                    startDateControl={
                        <EuiDatePicker
                            selected={startDate}
                            onChange={(date) => date && onStartDateChange(date)}
                            startDate={startDate}
                            endDate={endDate}
                            aria-label="Start date"
                            showTimeSelect
                        />
                    }
                    endDateControl={
                        <EuiDatePicker
                            selected={endDate}
                            onChange={(date) => date && onEndDateChange(date)}
                            startDate={startDate}
                            endDate={endDate}
                            aria-label="End date"
                            showTimeSelect
                        />
                    }
                />
                <EuiFlexItem grow={false}>
                    <EuiButton fill onClick={onFilter}>Filter</EuiButton>
                </EuiFlexItem>
            </EuiFlexGroup>
        </EuiPanel>
    );
}