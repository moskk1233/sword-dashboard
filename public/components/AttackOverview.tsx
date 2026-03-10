import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiText } from "@elastic/eui";
import { OverviewItem } from "../../common/types";
import React from "react";

interface Props {
    overview: OverviewItem[];
}

export const AttackOverview = ({
    overview
}: Props) => {
    return (
        <EuiFlexGroup wrap>
            {overview.map((item) => (
                <EuiFlexItem key={item.attackType}>
                    <EuiPanel style={{ backgroundColor: '#3d3d3d', textAlign: 'center' }}>
                        <EuiText>
                            <p style={{ color: '#ccc', fontSize: 13, marginBottom: 4 }}>
                                {item.attackType}
                            </p>
                            <strong style={{ color: '#fff', fontSize: 24 }}>
                                {item.count}
                            </strong>
                        </EuiText>
                    </EuiPanel>
                </EuiFlexItem>
            ))}
        </EuiFlexGroup>
    );
}