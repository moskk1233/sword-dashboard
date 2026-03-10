import React from "react";
import { EuiBasicTable, EuiPanel } from "@elastic/eui";
import { AttackItem } from "../../common/types";

interface Props {
    items: AttackItem[];
    totalItems: number;
    pageIndex: number;
    pageSize: number;
    loading: boolean;
    onChange: (criteria: { page: { index: number; size: number } }) => void;
}

const columns = [
    { field: 'timestamp', name: 'Timestamp', sortable: true },
    { field: 'agent_name', name: 'Agent Name', sortable: true },
    { field: 'src_ip', name: 'Source IP' },
    { field: 'dest_ip', name: 'Destination IP' },
    { field: 'dest_port', name: 'Destination Port' },
    { field: 'predicted_attack', name: 'Attack Type', sortable: true },
    {
        field: 'confidence',
        name: 'Confidence',
        render: (val: number, _record: AttackItem) => (val ? `${(val * 100).toFixed(0)}%` : '-'),
    },
];

export const AttackHistoryTable = ({
    items,
    totalItems,
    pageIndex,
    pageSize,
    loading,
    onChange,
}: Props) => {
    return (
        <EuiPanel paddingSize="none">
            <EuiBasicTable
                items={items}
                columns={columns}
                loading={loading}
                pagination={{
                    pageIndex,
                    pageSize,
                    totalItemCount: totalItems,
                }}
                onChange={onChange}
            />
        </EuiPanel>
    )
}