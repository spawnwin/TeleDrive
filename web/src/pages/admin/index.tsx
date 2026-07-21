import { CloseCircleFilled, DeleteOutlined, ReloadOutlined, SafetyCertificateOutlined, TeamOutlined, UserSwitchOutlined } from '@ant-design/icons'
import { Button, Card, Col, Form, Input, Layout, notification, Popconfirm, Row, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd'
import moment from 'moment'
import QueryString from 'qs'
import { FC, useEffect, useState } from 'react'
import useSWR from 'swr'
import { fetcher, req } from '../../utils/Fetcher'

interface Props {
  me?: any,
  errorMe?: any
}

const Admin: FC<Props> = ({ me, errorMe }) => {
  const { data: dataConfig, mutate: refetchConfig } = useSWR('/config', fetcher)
  const [configForm] = Form.useForm()
  const [loading, setLoading] = useState<boolean>()
  const [selectedRows, setSelectedRows] = useState<any[]>()

  const PAGE_SIZE = 10
  const [params, setParams] = useState<Record<string, any>>()
  const { data: dataUsers, error, mutate: refetchUsers } = useSWR(params ? `/users?${QueryString.stringify(params)}` : null, fetcher)

  useEffect(() => {
    if (me?.user && me.user.role !== 'admin') {
      window.location.replace('/dashboard')
    }
  }, [me])

  useEffect(() => {
    if (errorMe) {
      window.localStorage.clear()
      window.location.replace('/login')
    }
  }, [errorMe])

  useEffect(() => {
    if (dataConfig?.config) {
      setLoading(false)
      configForm.setFieldsValue({
        ...dataConfig.config,
        invitation_code: dataConfig.config.invitation_code ? `${location.host}/login?code=${dataConfig.config.invitation_code || ''}` : null
      })
    }
  }, [dataConfig])

  useEffect(() => {
    if (dataUsers?.users) {
      dataUsers.users = dataUsers.users.map((user: any) => ({ ...user, key: user.id }))
    }
  }, [dataUsers])

  useEffect(() => {
    setParams({
      offset: 0,
      limit: PAGE_SIZE,
      sort: 'created_at:desc',
    })
  }, [])

  const updateConfig = async () => {
    const values = configForm.getFieldsValue()
    try {
      const { data } = await req.patch('/config', { config: {
        ...values,
        invitation_code: values.invitation_code || null
      } })
      refetchConfig()
      return notification.success({
        key: 'update',
        message: 'Updated',
        description: data.config.disable_signup ? 'Signup is disabled for everyone' : data.config.invitation_code ? 'Signup is enabled by invitation code' : 'Signup is enabled for everyone',
      })
    } catch (error: any) {
      return notification.error({
        message: error?.response?.status || 'Something error',
        ...error?.response?.data ? { description: <>
          <Typography.Paragraph>
            {error?.response?.data?.error || error.message || 'Something error'}
          </Typography.Paragraph>
          <Typography.Paragraph code>
            {JSON.stringify(error?.response?.data || error?.data || error, null, 2)}
          </Typography.Paragraph>
        </> } : {}
      })
    }
  }

  const signupStatus = dataConfig?.config?.disable_signup
    ? { color: 'error' as const, label: 'Signup disabled' }
    : dataConfig?.config?.invitation_code
      ? { color: 'warning' as const, label: 'Invitation only' }
      : { color: 'success' as const, label: 'Signup open' }

  return <Layout className="admin-page">
    <Layout>
      <Layout.Content>
        <Row className="admin-page__row">
          <Col xxl={{ span: 16, offset: 4 }} xl={{ span: 18, offset: 3 }} lg={{ span: 20, offset: 2 }} md={{ span: 22, offset: 1 }} span={24}>
            <div className="admin-page__header">
              <div>
                <Typography.Title level={2} className="admin-page__title">
                  Users Management
                </Typography.Title>
                <Typography.Paragraph type="secondary" className="admin-page__subtitle">
                  Manage signup settings and user accounts
                </Typography.Paragraph>
              </div>
              {dataConfig?.config && (
                <Tag color={signupStatus.color} className="admin-page__status-tag">
                  {signupStatus.label}
                </Tag>
              )}
            </div>

            <Card
              className="admin-card"
              title={
                <Space size="middle">
                  <span className="admin-card__icon">
                    <SafetyCertificateOutlined />
                  </span>
                  <span>Signup Settings</span>
                </Space>
              }
            >
              <Form form={configForm} onFinish={updateConfig} layout="vertical" className="admin-config-form">
                <div className="admin-setting-row">
                  <div className="admin-setting-row__info">
                    <Typography.Text strong>Disable Signup</Typography.Text>
                    <Typography.Paragraph type="secondary" className="admin-setting-row__hint">
                      Prevent new users from creating accounts
                    </Typography.Paragraph>
                  </div>
                  <Form.Item name="disable_signup" valuePropName="checked" className="admin-setting-row__control">
                    <Switch onChange={() => updateConfig()} />
                  </Form.Item>
                </div>

                {!dataConfig?.config.disable_signup && (
                  <Form.Item
                    name="invitation_code"
                    label="Invitation Code"
                    className="admin-invitation-field"
                  >
                    {dataConfig?.config.invitation_code ? (
                      <Input.Search
                        className="admin-invitation-input"
                        suffix={<Button size="small" type="text" icon={<CloseCircleFilled />} onClick={() => {
                          setLoading(true)
                          req.patch('/config', { config: { clear_invitation_code: true } }).then(({ data }) => {
                            refetchConfig()
                            notification.success({
                              key: 'update',
                              message: 'Updated',
                              description: data.config.disable_signup ? 'Signup is disabled for everyone' : data.config.invitation_code ? 'Signup is enabled by invitation code' : 'Signup is enabled for everyone',
                            })
                          })
                        }} />}
                        loading={loading}
                        enterButton={<><ReloadOutlined /> Generate</>}
                        onSearch={() => {
                          setLoading(true)
                          req.post('/config/resetInvitationCode').then(({ data }) => {
                            refetchConfig()
                            notification.success({
                              key: 'update',
                              message: 'Updated',
                              description: data.config.disable_signup ? 'Signup is disabled for everyone' : data.config.invitation_code ? 'Signup is enabled by invitation code' : 'Signup is enabled for everyone',
                            })
                          })
                        }}
                      />
                    ) : (
                      <Button
                        loading={loading}
                        type="primary"
                        shape="round"
                        icon={<ReloadOutlined />}
                        onClick={() => {
                          setLoading(true)
                          req.post('/config/resetInvitationCode').then(({ data }) => {
                            refetchConfig()
                            notification.success({
                              key: 'update',
                              message: 'Updated',
                              description: data.config.disable_signup ? 'Signup is disabled for everyone' : data.config.invitation_code ? 'Signup is enabled by invitation code' : 'Signup is enabled for everyone',
                            })
                          })
                        }}
                      >
                        Generate
                      </Button>
                    )}
                  </Form.Item>
                )}
              </Form>
            </Card>

            <Card
              className="admin-card admin-card--users"
              title={
                <Space size="middle">
                  <span className="admin-card__icon">
                    <TeamOutlined />
                  </span>
                  <span>Users</span>
                  {typeof dataUsers?.length === 'number' && (
                    <Tag className="admin-users-count">{dataUsers.length}</Tag>
                  )}
                </Space>
              }
            >
              <div className="admin-users-toolbar">
                <Input.Search
                  allowClear
                  className="admin-users-search"
                  placeholder="Search by username or name..."
                  onSearch={val => {
                    setParams({
                      ...params,
                      offset: 0,
                      search: val || undefined
                    })
                  }}
                />
                <Popconfirm title="Are you sure?" onConfirm={() => {
                  Promise.all((selectedRows || [])?.map(async (user: any) => {
                    try {
                      await req.delete(`/users/${user.id}`)
                    } catch (error) {
                      //
                    }
                  })).then(() => {
                    refetchUsers()
                    setSelectedRows(undefined)
                    notification.success({
                      message: `Delete ${selectedRows?.length} users`
                    })
                  })
                }}>
                  <Button
                    disabled={!selectedRows?.length}
                    danger
                    shape="round"
                    icon={<DeleteOutlined />}
                  >
                    Delete
                  </Button>
                </Popconfirm>
              </div>
              <Table
                className="admin-users-table"
                loading={!dataUsers && !error}
                columns={[
                  {
                    title: 'ID',
                    dataIndex: 'id',
                    key: 'id',
                    width: 350,
                  },
                  {
                    title: 'Role',
                    dataIndex: 'role',
                    key: 'role',
                    render: (value: string, record) => <>{<Tag color={record.role === 'admin' ? 'blue' : 'default'} className="admin-role-tag">{record.role}</Tag>}</>
                  },
                  {
                    title: 'Username',
                    dataIndex: 'username',
                    key: 'username',
                    render: (value: string) => <>{value}</>
                  },
                  {
                    title: 'Name',
                    dataIndex: 'name',
                    key: 'name',
                  },
                  {
                    title: 'Registered At',
                    dataIndex: 'created_at',
                    key: 'created_at',
                    width: 230,
                    sorter: true,
                    render: (value: any) => moment(value).local().format('llll')
                  },
                  {
                    title: '',
                    dataIndex: 'actions',
                    key: 'actions',
                    render: (_, record) => <Space>
                      <Tooltip title={`Switch to ${record.role === 'admin' ? 'user' : 'admin'}`}>
                        <Button className="admin-action-btn" icon={<UserSwitchOutlined />} size="small" type="text" onClick={() => {
                          req.patch(`/users/${record.id}`, { user: { role: record.role === 'admin' ? null : 'admin' } }).then(() => {
                            notification.success({ message: `Switch ${record.username} to ${record.role === 'admin' ? 'user' : 'admin'}` })
                            refetchUsers()
                          }).catch(error => {
                            notification.error({
                              message: error?.response?.status || 'Something error',
                              ...error?.response?.data ? { description: <>
                                <Typography.Paragraph>
                                  {error?.response?.data?.error || error.message || 'Something error'}
                                </Typography.Paragraph>
                                <Typography.Paragraph code>
                                  {JSON.stringify(error?.response?.data || error?.data || error, null, 2)}
                                </Typography.Paragraph>
                              </> } : {}
                            })
                          })
                        }} />
                      </Tooltip>
                      <Popconfirm className="normal" title="Are you sure?" onConfirm={() => {
                        req.delete(`/users/${record.id}`).then(() => {
                          notification.success({ message: `Delete ${record.username} successfully!` })
                          refetchUsers()
                        }).catch(error => {
                          notification.error({
                            message: error?.response?.status || 'Something error',
                            ...error?.response?.data ? { description: <>
                              <Typography.Paragraph>
                                {error?.response?.data?.error || error.message || 'Something error'}
                              </Typography.Paragraph>
                              <Typography.Paragraph code>
                                {JSON.stringify(error?.response?.data || error?.data || error, null, 2)}
                              </Typography.Paragraph>
                            </> } : {}
                          })
                        })
                      }}>
                        <Button className="admin-action-btn admin-action-btn--danger" danger icon={<DeleteOutlined />} type="text" size="small" />
                      </Popconfirm>
                    </Space>
                  },
                ]}
                dataSource={dataUsers?.users}
                scroll={{ x: 900 }}
                pagination={{
                  total: dataUsers?.length,
                  pageSize: PAGE_SIZE,
                  showSizeChanger: false
                }}
                onChange={(page, _, sorter: any) => {
                  setParams({
                    ...params,
                    offset: ((page.current || 1) - 1) * PAGE_SIZE,
                    sort: sorter?.order ? `${sorter?.field}:${sorter?.order === 'ascend' ? 'asc' : 'desc'}` : 'created_at:desc',
                  })
                }}
                rowSelection={{
                  type: 'checkbox',
                  onChange: (_, selectedRows) => {
                    setSelectedRows(selectedRows)
                  }
                }}
              />
            </Card>
          </Col>
        </Row>
      </Layout.Content>
    </Layout>
  </Layout>
}

export default Admin
